import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE
    ? pathToFileURL(process.env.PGLITE_MODULE).href
    : '@electric-sql/pglite');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
const user = '00000000-0000-4000-8000-000000000001';
const otherUser = '00000000-0000-4000-8000-000000000002';
const apiKey = '00000000-0000-4000-8000-000000000003';
const otherKey = '00000000-0000-4000-8000-000000000004';
const session = '00000000-0000-4000-8000-000000000005';
await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.users (id uuid PRIMARY KEY, credits integer, total_credits_used integer DEFAULT 0, total_credits_purchased integer DEFAULT 0);
    CREATE TABLE public.learning_sessions (id uuid PRIMARY KEY);
    CREATE TABLE public.credit_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES public.users(id), transaction_type text, credits integer, description text, session_id uuid REFERENCES public.learning_sessions(id), stripe_payment_intent_id text);
`);
for (const file of ['0032_atomic_credits_and_webhook_idempotency.sql', '20261018105346_voice_session_grants.sql']) {
    await db.exec(await readFile(path.join(root, 'supabase/migrations', file), 'utf8'));
}
const row = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const state = () => row('SELECT credits, total_credits_used FROM public.users WHERE id=$1', [user]);
const grant = (id) => row('SELECT * FROM public.voice_session_grants WHERE id=$1', [id]);
const reserve = (id = null, key = null, owner = user, learningSession = null) => row(
    'SELECT * FROM public.grant_voice_minutes_v2($1,$2,$3,$4,5,90,4)', [owner, id, key, learningSession]);
const finalize = (issuance, success, key = null, owner = user) => row(
    'SELECT * FROM public.finalize_voice_token_issuance($1,$2,$3,$4,$5)',
    [owner, issuance.grant_id, key, issuance.issuance_id, success]);
const reset = async () => {
    await db.exec('TRUNCATE public.users CASCADE;');
    await db.query('INSERT INTO public.users(id,credits) VALUES ($1,20),($2,20)', [user, otherUser]);
    await db.query('INSERT INTO public.learning_sessions(id) VALUES ($1) ON CONFLICT DO NOTHING', [session]);
};

await test('original SQL reproduces no-charge independent issuance and refunded extended expiry', async () => {
    await reset();
    const first = await row('SELECT * FROM public.grant_voice_minutes($1,NULL,NULL,NULL,5,90,4)', [user]);
    const reconnect = await row('SELECT * FROM public.grant_voice_minutes($1,$2,NULL,NULL,5,90,4)', [user, first.grant_id]);
    assert.equal(reconnect.status, 'resumed');
    assert.equal(reconnect.minutes_charged, 0);
    await db.query("UPDATE public.voice_session_grants SET expires_at=NOW()+INTERVAL '60 seconds' WHERE id=$1", [first.grant_id]);
    const before = await grant(first.grant_id);
    const renewed = await row('SELECT * FROM public.grant_voice_minutes($1,$2,NULL,NULL,5,90,4)', [user, first.grant_id]);
    await db.query("SELECT public.add_user_credits($1,5,'Old route refund','refund',NULL)", [user]);
    const afterRefund = await grant(first.grant_id);
    assert.equal(renewed.status, 'charged');
    assert.equal(new Date(afterRefund.expires_at) - new Date(before.expires_at), 300_000);
    assert.equal((await state()).credits, 15);
});

const migration = process.env.VOICE_BILLING_MIGRATION ?? (await readdir(path.join(root, 'supabase/migrations'))).find((name) => name.endsWith('_voice_token_issuance.sql'));
assert.ok(migration, 'voice_token_issuance migration must exist');
await db.exec(await readFile(path.resolve(root, 'supabase/migrations', migration), 'utf8'));

await test('new issuance reserves and charges exactly one prepaid block', async () => {
    await reset();
    const result = await reserve(null, null, user, session);
    assert.equal(result.status, 'charged');
    assert.equal(result.minutes_charged, 5);
    assert.ok(result.issuance_id);
    assert.deepEqual(await state(), { credits: 15, total_credits_used: 5 });
    assert.equal((await grant(result.grant_id)).pending_issuance_id, result.issuance_id);
});

await test('pending issuance blocks competing requests without a second charge', async () => {
    await reset();
    const first = await reserve();
    const attempts = await Promise.all(Array.from({ length: 4 }, () => reserve(first.grant_id)));
    assert.ok(attempts.every((attempt) => attempt.status === 'pending_issuance'));
    assert.deepEqual(await state(), { credits: 15, total_credits_used: 5 });
    assert.equal((await row('SELECT COUNT(*)::integer AS count FROM public.voice_token_issuances')).count, 1);
});

await test('completed grant cannot mint a second no-charge token', async () => {
    await reset();
    const first = await reserve();
    assert.equal((await finalize(first, true)).status, 'completed');
    const reused = await reserve(first.grant_id);
    assert.equal(reused.status, 'active_grant');
    assert.equal(reused.issuance_id, null);
    assert.equal(reused.minutes_charged, 0);
    assert.deepEqual(await state(), { credits: 15, total_credits_used: 5 });
});

await test('stale pending issuance counts as issued so the grant can renew again', async () => {
    await reset();
    const first = await reserve();
    await db.query("UPDATE public.voice_token_issuances SET created_at=NOW()-INTERVAL '3 minutes' WHERE id=$1", [first.issuance_id]);
    assert.equal((await reserve(first.grant_id)).status, 'active_grant');
    assert.equal((await row('SELECT status FROM public.voice_token_issuances WHERE id=$1', [first.issuance_id])).status, 'completed');
    assert.equal((await grant(first.grant_id)).pending_issuance_id, null);
    assert.equal((await finalize(first, false)).status, 'completed');
    assert.deepEqual(await state(), { credits: 15, total_credits_used: 5 });
    await db.query("UPDATE public.voice_session_grants SET expires_at=NOW()+INTERVAL '60 seconds' WHERE id=$1", [first.grant_id]);
    assert.equal((await reserve(first.grant_id)).status, 'charged');
    assert.deepEqual(await state(), { credits: 10, total_credits_used: 10 });
});

await test('a one-minute charge is described in the singular', async () => {
    await reset();
    await db.query('UPDATE public.users SET credits=1 WHERE id=$1', [user]);
    await reserve();
    const { description } = await row("SELECT description FROM public.credit_transactions WHERE user_id=$1 AND transaction_type<>'refund' ORDER BY description LIMIT 1", [user]);
    assert.equal(description, 'Used 1 credit for 1 minute of AI voice session');
});

await test('failed first token refunds once, expires grant, and retry charges again', async () => {
    await reset();
    const first = await reserve();
    assert.equal((await finalize(first, false)).status, 'refunded');
    const refunded = await grant(first.grant_id);
    assert.equal(refunded.minutes_charged, 0);
    assert.equal(refunded.pending_issuance_id, null);
    assert.deepEqual(await state(), { credits: 20, total_credits_used: 0 });
    assert.equal((await finalize(first, false)).status, 'refunded');
    assert.deepEqual(await state(), { credits: 20, total_credits_used: 0 });
    const retry = await reserve(first.grant_id);
    assert.equal(retry.status, 'charged');
    assert.notEqual(retry.issuance_id, first.issuance_id);
    assert.deepEqual(await state(), { credits: 15, total_credits_used: 5 });
    await finalize(first, false);
    assert.equal((await grant(retry.grant_id)).pending_issuance_id, retry.issuance_id);
});

await test('failed renewal restores paid expiry, grant counters, balance and usage', async () => {
    await reset();
    const first = await reserve(null, null, user, session);
    await finalize(first, true);
    await db.query("UPDATE public.voice_session_grants SET expires_at=NOW()+INTERVAL '60 seconds', tokens_in_block=3 WHERE id=$1", [first.grant_id]);
    const previous = await grant(first.grant_id);
    const renewal = await reserve(first.grant_id);
    assert.equal(renewal.status, 'charged');
    assert.equal(new Date(renewal.expires_at) - new Date(previous.expires_at), 300_000);
    await finalize(renewal, false);
    const restored = await grant(first.grant_id);
    for (const field of ['expires_at', 'minutes_charged', 'tokens_in_block', 'session_id']) {
        assert.deepEqual(restored[field], previous[field], field);
    }
    assert.deepEqual(await state(), { credits: 15, total_credits_used: 5 });
    const retry = await reserve(first.grant_id);
    assert.equal(retry.status, 'charged');
    assert.deepEqual(await state(), { credits: 10, total_credits_used: 10 });
});

await test('success then failure replay cannot refund an issued token', async () => {
    await reset();
    const issued = await reserve();
    await finalize(issued, true);
    assert.equal((await finalize(issued, false)).status, 'completed');
    assert.deepEqual(await state(), { credits: 15, total_credits_used: 5 });
    assert.equal((await row("SELECT COUNT(*)::integer AS count FROM public.credit_transactions WHERE transaction_type='refund'")).count, 0);
});

await test('refund ledger failure rolls back grant restoration and can retry safely', async () => {
    await reset();
    const issued = await reserve();
    const reserved = await grant(issued.grant_id);
    await db.exec(`
        CREATE FUNCTION public.reject_voice_refund_test() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.transaction_type='refund' THEN RAISE EXCEPTION 'mock refund ledger unavailable'; END IF;
            RETURN NEW;
        END;
        $$;
        CREATE TRIGGER reject_voice_refund_test BEFORE INSERT ON public.credit_transactions FOR EACH ROW EXECUTE FUNCTION public.reject_voice_refund_test();
    `);
    try {
        await assert.rejects(finalize(issued, false), /mock refund ledger unavailable/);
        assert.deepEqual(await state(), { credits: 15, total_credits_used: 5 });
        assert.deepEqual(await grant(issued.grant_id), reserved);
        assert.equal((await row('SELECT status FROM public.voice_token_issuances WHERE id=$1', [issued.issuance_id])).status, 'pending');
    } finally {
        await db.exec('DROP TRIGGER reject_voice_refund_test ON public.credit_transactions; DROP FUNCTION public.reject_voice_refund_test();');
    }
    assert.equal((await finalize(issued, false)).status, 'refunded');
    assert.deepEqual(await state(), { credits: 20, total_credits_used: 0 });
});

await test('failure then success replay cannot revive refunded time or double refund', async () => {
    await reset();
    const issued = await reserve();
    const results = await Promise.all([finalize(issued, false), finalize(issued, true), finalize(issued, false)]);
    assert.ok(results.every((result) => result.status === 'refunded'));
    assert.deepEqual(await state(), { credits: 20, total_credits_used: 0 });
    assert.equal((await row("SELECT COUNT(*)::integer AS count FROM public.credit_transactions WHERE transaction_type='refund'")).count, 1);
});

await test('ownership and API key mismatches cannot reserve or finalize another grant', async () => {
    await reset();
    const issued = await reserve(null, apiKey);
    assert.equal((await reserve(issued.grant_id, otherKey)).status, 'not_found');
    assert.equal((await reserve(issued.grant_id, apiKey, otherUser)).status, 'not_found');
    assert.equal((await finalize(issued, false, otherKey)).status, 'not_found');
    assert.equal((await finalize(issued, false, apiKey, otherUser)).status, 'not_found');
    assert.deepEqual(await state(), { credits: 15, total_credits_used: 5 });
    assert.equal((await finalize(issued, false, apiKey)).status, 'refunded');
});

await test('partial final balance buys exact minutes and insufficient renewal keeps paid expiry', async () => {
    await reset();
    await db.query('UPDATE public.users SET credits=2 WHERE id=$1', [user]);
    const first = await reserve();
    assert.equal(first.minutes_charged, 2);
    await finalize(first, true);
    await db.query("UPDATE public.voice_session_grants SET expires_at=NOW()+INTERVAL '60 seconds' WHERE id=$1", [first.grant_id]);
    const previous = await grant(first.grant_id);
    const denied = await reserve(first.grant_id);
    assert.equal(denied.status, 'insufficient_credits');
    assert.deepEqual(denied.expires_at, previous.expires_at);
    assert.deepEqual(await state(), { credits: 0, total_credits_used: 2 });
});

await test('legacy RPC fails closed and private tables/functions deny browser roles', async () => {
    await reset();
    await assert.rejects(row('SELECT * FROM public.grant_voice_minutes($1,NULL,NULL,NULL,5,90,4)', [user]), /requires.*issuance|retired|upgrade/i);
    assert.deepEqual(await state(), { credits: 20, total_credits_used: 0 });
    for (const role of ['anon', 'authenticated']) {
        const permissions = await row(`SELECT has_function_privilege($1,'public.grant_voice_minutes_v2(uuid,uuid,uuid,uuid,integer,integer,integer)','EXECUTE') AS reserve, has_function_privilege($1,'public.finalize_voice_token_issuance(uuid,uuid,uuid,uuid,boolean)','EXECUTE') AS finalize, has_table_privilege($1,'public.voice_token_issuances','SELECT') AS read`, [role]);
        assert.deepEqual(permissions, { reserve: false, finalize: false, read: false });
    }
    assert.equal((await row("SELECT relrowsecurity FROM pg_class WHERE oid='public.voice_token_issuances'::regclass")).relrowsecurity, true);
});

await db.close();
