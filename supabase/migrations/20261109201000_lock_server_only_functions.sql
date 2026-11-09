-- Server-only functions were still callable through the public API.
-- `REVOKE ... FROM PUBLIC` does not remove Supabase's default grants to the
-- anon and authenticated roles, so each role is named here. Every caller in
-- the app uses the service role.

-- No caller check inside: anyone could reset rate-limit counters and daily AI
-- caps, inflate API key usage, or read lesson material chunks.
REVOKE EXECUTE ON FUNCTION public.hit_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_counters() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_api_key_minutes(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_api_key_usage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_lesson_asset_chunks(extensions.vector, uuid, uuid, uuid[], integer) FROM PUBLIC, anon, authenticated;

-- These already refuse non-service callers; remove the grant as well.
REVOKE EXECUTE ON FUNCTION public.create_lesson_draft(text, text, text, text, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_lesson_manifest(uuid, jsonb, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_generated_lesson_artifact(uuid, uuid, integer, text, integer, jsonb, jsonb, jsonb, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_learning_fallback(uuid, uuid, uuid, text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_organization_ai_usage_batch(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hit_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_counters() TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_api_key_minutes(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_api_key_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_lesson_asset_chunks(extensions.vector, uuid, uuid, uuid[], integer) TO service_role;

-- Pin the search path on the three functions that still inherit the caller's.
ALTER FUNCTION public.handle_auth_user_login() SET search_path = public;
ALTER FUNCTION public.create_organization_owner_member() SET search_path = public;
ALTER FUNCTION public.update_organization_timestamp() SET search_path = public;
