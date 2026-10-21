-- Approved artifacts and the assets they use are immutable, which also made
-- the ON DELETE CASCADE from lessons fail. delete_lesson_draft() marks the
-- lesson it is removing so the guards let that one cascade through.
CREATE OR REPLACE FUNCTION public.prevent_approved_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('insyte.deleting_lesson', true) = OLD.lesson_id::text THEN
    RETURN OLD;
  END IF;

  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Approved lesson artifacts are immutable; create a new version';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_published_asset_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('insyte.deleting_lesson', true) = OLD.lesson_id::text THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lesson_artifacts a
    WHERE a.status = 'approved' AND a.payload->>'assetId' = OLD.id::text
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Assets referenced by approved lesson artifacts are immutable';
    ELSIF OLD.storage_bucket IS DISTINCT FROM NEW.storage_bucket
      OR OLD.storage_path IS DISTINCT FROM NEW.storage_path
      OR OLD.mime_type IS DISTINCT FROM NEW.mime_type
      OR OLD.byte_size IS DISTINCT FROM NEW.byte_size
      OR OLD.checksum_sha256 IS DISTINCT FROM NEW.checksum_sha256 THEN
      RAISE EXCEPTION 'Assets referenced by approved lesson artifacts are immutable';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;