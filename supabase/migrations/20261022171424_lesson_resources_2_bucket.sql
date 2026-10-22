-- Private bucket: uploads use server-issued signed upload URLs and downloads
-- use short-lived signed URLs, so browsers never get direct access.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lesson-resources', 'lesson-resources', false, 26214400,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/mpeg', 'video/mp4'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'lesson_resources_server_only') THEN
    CREATE POLICY lesson_resources_server_only ON storage.objects
      AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (bucket_id <> 'lesson-resources')
      WITH CHECK (bucket_id <> 'lesson-resources');
  END IF;
END $$;
