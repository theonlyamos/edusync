BEGIN;

REVOKE EXECUTE ON FUNCTION public.deduct_user_credits(uuid, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_user_credits(uuid, integer, text, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.add_user_credits(uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_user_credits(uuid, integer, text, text, text) TO service_role;

COMMIT;
