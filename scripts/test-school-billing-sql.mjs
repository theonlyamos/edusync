import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE
    ? pathToFileURL(process.env.PGLITE_MODULE).href
    : '@electric-sql/pglite');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrations = path.join(root, 'supabase/migrations');
const db = new PGlite();

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1);
const teacher = id(2);
const student = id(3);
const loner = id(4);
const devOwner = id(5);
const school = id(10);
const devOrg = id(11);
const event = id(20);
const personalEvent = id(21);

// A minimal copy of the tables the billing migrations build on.
await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, service_role;

    CREATE TABLE public.users (id uuid PRIMARY KEY, credits integer, total_credits_used integer DEFAULT 0, total_credits_purchased integer DEFAULT 0);
    CREATE TABLE public.organizations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
      owner_id uuid NOT NULL REFERENCES public.users(id), type text NOT NULL DEFAULT 'developer',
      credits integer NOT NULL DEFAULT 0, total_credits_purchased integer NOT NULL DEFAULT 0,
      total_credits_used integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.organization_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES public.users(id), role text NOT NULL,
      joined_at timestamptz NOT NULL DEFAULT now(), is_active boolean NOT NULL DEFAULT true,
      UNIQUE (organization_id, user_id));
    CREATE FUNCTION public.user_school_id(p_user_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT m.organization_id FROM public.organization_members m JOIN public.organizations o ON o.id = m.organization_id
      WHERE m.user_id = p_user_id AND m.is_active AND o.type = 'school' ORDER BY m.joined_at LIMIT 1 $$;
    CREATE TABLE public.live_class_events (id uuid PRIMARY KEY, organizer_id uuid NOT NULL REFERENCES public.users(id), organization_id uuid REFERENCES public.organizations(id));
    CREATE TABLE public.learning_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), live_class_event_id uuid REFERENCES public.live_class_events(id));
    CREATE TABLE public.credit_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES public.users(id), transaction_type text, credits integer, description text, session_id uuid REFERENCES public.learning_sessions(id), stripe_payment_intent_id text);
    CREATE TABLE public.content_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requested_by uuid NOT NULL REFERENCES public.users(id),
      organization_id uuid REFERENCES public.organizations(id), idempotency_key text NOT NULL,
      status text NOT NULL DEFAULT 'queued');
    CREATE TABLE public.organization_ai_quotas (
      organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
      monthly_interactive_limit bigint, monthly_image_limit bigint, monthly_quiz_limit bigint,
      monthly_media_bytes_limit bigint, monthly_student_fallback_limit bigint,
      allow_student_fallback boolean NOT NULL DEFAULT true, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.organization_ai_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      category text NOT NULL, quantity bigint NOT NULL CHECK (quantity > 0), reference_id text NOT NULL,
      period_start date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, user_id, category, reference_id));
    GRANT SELECT, UPDATE ON public.organizations TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.organization_ai_quotas TO authenticated;
`);

await db.query(`INSERT INTO public.users (id, credits) VALUES ($1, 0), ($2, 0), ($3, 0), ($4, 20), ($5, 0)`, [owner, teacher, student, loner, devOwner]);
await db.query(`INSERT INTO public.organizations (id, name, owner_id, type) VALUES ($1, 'Existing School', $2, 'school'), ($3, 'Dev', $4, 'developer')`, [school, owner, devOrg, devOwner]);
await db.query(`INSERT INTO public.organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'teacher'), ($1, $4, 'student')`, [school, owner, teacher, student]);

for (const file of ['0032_atomic_credits_and_webhook_idempotency.sql', '20261018105346_voice_session_grants.sql']) {
    await db.exec(await readFile(path.join(migrations, file), 'utf8'));
}
const voiceMigration = (await readdir(migrations)).find((name) => name.endsWith('_voice_token_issuance.sql'));
await db.exec(await readFile(path.join(migrations, voiceMigration), 'utf8'));

const billingSteps = (await readdir(migrations)).filter((name) => /^\d{14}_school_billing_\d/.test(name)).sort();
assert.equal(billingSteps.length, 5, 'school billing steps must all exist');
for (const name of billingSteps) {
    await db.exec(await readFile(path.join(migrations, name), 'utf8'));
}

const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await rows(sql, params))[0];
const pool = (org = school) => one('SELECT credits, trial_credits, total_credits_used, total_credits_purchased FROM public.organizations WHERE id = $1', [org]);
const setPool = (paid, trial, expires = "now() + interval '10 days'") =>
    db.exec(`UPDATE public.organizations SET credits = ${paid}, trial_credits = ${trial}, trial_expires_at = ${expires}, total_credits_used = 0 WHERE id = '${school}'`);
const asServiceRole = async (fn) => {
    await db.exec(`SELECT set_config('request.jwt.claim.role', 'service_role', false)`);
    try { return await fn(); } finally { await db.exec(`SELECT set_config('request.jwt.claim.role', '', false)`); }
};
const asUser = async (userId, fn) => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId}', false); SELECT set_config('request.jwt.claim.role', 'authenticated', false);`);
    try { return await fn(); } finally {
        await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false); SELECT set_config('request.jwt.claim.role', '', false);`);
    }
};

await test('existing schools get the 300-credit trial once, developer orgs do not', async () => {
    const s = await one('SELECT trial_credits, trial_expires_at > now() + interval \'29 days\' AS month FROM public.organizations WHERE id = $1', [school]);
    assert.deepEqual(s, { trial_credits: 300, month: true });
    assert.equal((await pool(devOrg)).trial_credits, 0);
    assert.equal(await one('SELECT public.grant_school_trial($1) AS g', [school]).then((r) => r.g), false);
    assert.equal((await pool()).trial_credits, 300);
});

await test('a newly created school starts with the trial', async () => {
    const fresh = id(12);
    await db.query(`INSERT INTO public.organizations (id, name, owner_id, type) VALUES ($1, 'New School', $2, 'school')`, [fresh, devOwner]);
    assert.equal((await pool(fresh)).trial_credits, 300);
    const ledger = await rows('SELECT transaction_type, credits, balance_after FROM public.organization_credit_transactions WHERE organization_id = $1', [fresh]);
    assert.deepEqual(ledger, [{ transaction_type: 'trial', credits: 300, balance_after: 300 }]);
    await db.query('DELETE FROM public.organizations WHERE id = $1', [fresh]);
});

await test('spending uses trial credits first, then purchased credits', async () => {
    await setPool(10, 3);
    const left = await one(`SELECT public.deduct_school_credits($1, $2, 5, 'voice', 'test') AS v`, [school, student]);
    assert.equal(left.v, 8);
    assert.deepEqual(await pool(), { credits: 8, trial_credits: 0, total_credits_used: 5, total_credits_purchased: 0 });
    assert.equal((await one(`SELECT public.deduct_school_credits($1, $2, 9, 'voice', 'test') AS v`, [school, student])).v, null);
    assert.equal((await pool()).credits, 8, 'a failed deduction changes nothing');
});

await test('expired trial credits are dropped with a ledger row', async () => {
    await setPool(4, 50, "now() - interval '1 minute'");
    assert.equal((await one(`SELECT public.deduct_school_credits($1, $2, 5, 'voice', 'test') AS v`, [school, student])).v, null);
    assert.deepEqual(await pool(), { credits: 4, trial_credits: 0, total_credits_used: 0, total_credits_purchased: 0 });
    const expiry = await one(`SELECT credits, balance_after FROM public.organization_credit_transactions WHERE organization_id = $1 AND transaction_type = 'expiry' ORDER BY created_at DESC LIMIT 1`, [school]);
    assert.deepEqual(expiry, { credits: -50, balance_after: 4 });
});

await test('purchases count once per payment and refunds go back to a running trial', async () => {
    await setPool(0, 5);
    assert.equal((await one(`SELECT public.add_school_credits($1, 100, 'purchase', 'Bought', $2, 'pi_1') AS v`, [school, owner])).v, 105);
    await assert.rejects(db.query(`SELECT public.add_school_credits($1, 100, 'purchase', 'Bought', $2, 'pi_1')`, [school, owner]), /unique|duplicate/i);
    assert.equal((await pool()).total_credits_purchased, 100);
    await db.query(`SELECT public.deduct_school_credits($1, $2, 5, 'voice', 'x', NULL, 'r1')`, [school, student]);
    await db.query(`SELECT public.add_school_credits($1, 5, 'refund', 'Refund', $2, NULL, 'voice', 'r1')`, [school, student]);
    assert.deepEqual(await pool(), { credits: 100, trial_credits: 5, total_credits_used: 0, total_credits_purchased: 100 });
    await db.exec(`UPDATE public.organizations SET total_credits_purchased = 0 WHERE id = '${school}'`);
});

await test('a refund restores the trial and purchased split of the charge it undoes', async () => {
    await setPool(10, 3);
    await db.query(`SELECT public.deduct_school_credits($1, $2, 5, 'voice', 'x', NULL, 'split')`, [school, student]);
    assert.deepEqual(await pool(), { credits: 8, trial_credits: 0, total_credits_used: 5, total_credits_purchased: 0 });
    await db.query(`SELECT public.add_school_credits($1, 5, 'refund', 'Refund', $2, NULL, 'voice', 'split')`, [school, student]);
    assert.deepEqual(await pool(), { credits: 10, trial_credits: 3, total_credits_used: 0, total_credits_purchased: 0 });
    // A charge paid from purchased credits during a running trial goes back to purchased credits.
    await setPool(10, 0);
    await db.query(`SELECT public.deduct_school_credits($1, $2, 4, 'voice', 'x', NULL, 'paidonly')`, [school, student]);
    await db.query(`SELECT public.add_school_credits($1, 4, 'refund', 'Refund', $2, NULL, 'voice', 'paidonly')`, [school, student]);
    assert.deepEqual(await pool(), { credits: 10, trial_credits: 0, total_credits_used: 0, total_credits_purchased: 0 });
    // A second refund for the same charge has nothing left to restore from the trial.
    await setPool(0, 6);
    await db.query(`SELECT public.deduct_school_credits($1, $2, 6, 'voice', 'x', NULL, 'twice')`, [school, student]);
    await db.query(`SELECT public.add_school_credits($1, 4, 'refund', 'Refund', $2, NULL, 'voice', 'twice')`, [school, student]);
    await db.query(`SELECT public.add_school_credits($1, 2, 'refund', 'Refund', $2, NULL, 'voice', 'twice')`, [school, student]);
    assert.deepEqual(await pool(), { credits: 0, trial_credits: 6, total_credits_used: 0, total_credits_purchased: 0 });
});

await test('trial credits refunded after the trial ended expire straight away', async () => {
    await setPool(2, 5);
    await db.query(`SELECT public.deduct_school_credits($1, $2, 5, 'voice', 'x', NULL, 'late')`, [school, student]);
    await db.exec(`UPDATE public.organizations SET trial_expires_at = now() - interval '1 minute' WHERE id = '${school}'`);
    const after = await one(`SELECT public.add_school_credits($1, 5, 'refund', 'Refund', $2, NULL, 'voice', 'late') AS v`, [school, student]);
    assert.equal(after.v, 2);
    assert.deepEqual(await pool(), { credits: 2, trial_credits: 0, total_credits_used: 0, total_credits_purchased: 0 });
    const last = await rows(`SELECT transaction_type, credits FROM public.organization_credit_transactions WHERE organization_id = $1 ORDER BY created_at DESC, transaction_type LIMIT 2`, [school]);
    assert.deepEqual(last.map((r) => r.transaction_type).sort(), ['expiry', 'refund']);
});

await test('a refund with no matching charge goes to purchased credits', async () => {
    await setPool(0, 5);
    await db.query(`SELECT public.add_school_credits($1, 3, 'refund', 'Refund', $2, NULL, 'voice', 'nothing')`, [school, student]);
    assert.deepEqual(await pool(), { credits: 3, trial_credits: 5, total_credits_used: 0, total_credits_purchased: 0 });
});

await test('school owners cannot write their own credits', async () => {
    await assert.rejects(
        asUser(owner, () => db.query(`UPDATE public.organizations SET credits = 99999 WHERE id = $1`, [school])),
        /only change through billing/,
    );
    // Developer organizations keep their old behavior.
    await asUser(devOwner, () => db.query(`UPDATE public.organizations SET credits = 5 WHERE id = $1`, [devOrg]));
    assert.equal((await pool(devOrg)).credits, 5);
});

const reserve = (userId, grant = null, key = null) => one('SELECT * FROM public.grant_voice_minutes_v2($1,$2,$3,NULL,5,90,1)', [userId, grant, key]);
const finalize = (userId, r, ok, key = null) => one('SELECT * FROM public.finalize_voice_token_issuance($1,$2,$3,$4,$5)', [userId, r.grant_id, key, r.issuance_id, ok]);

await test('school members pay for the voice tutor from the school pool', async () => {
    await setPool(0, 12);
    const r = await reserve(student);
    assert.equal(r.status, 'charged');
    assert.equal(r.minutes_charged, 5);
    assert.equal(r.remaining_credits, 7);
    assert.equal((await pool()).trial_credits, 7);
    assert.equal((await one('SELECT credits FROM public.users WHERE id = $1', [student])).credits, 0);
    const ledger = await one(`SELECT user_id, usage_kind, credits FROM public.organization_credit_transactions WHERE reference_id = $1`, [r.issuance_id]);
    assert.deepEqual(ledger, { user_id: student, usage_kind: 'voice', credits: -5 });
});

await test('a failed school voice token refunds the school pool', async () => {
    await setPool(0, 12);
    const r = await reserve(teacher);
    assert.equal((await finalize(teacher, r, false)).status, 'refunded');
    assert.deepEqual(await pool(), { credits: 0, trial_credits: 12, total_credits_used: 0, total_credits_purchased: 0 });
});

await test('an empty school pool stops the voice tutor, the last minutes are sold in part', async () => {
    await setPool(2, 0);
    const r = await reserve(student);
    assert.equal(r.minutes_charged, 2);
    await finalize(student, r, true);
    await db.query("UPDATE public.voice_session_grants SET expires_at = now() + interval '30 seconds' WHERE id = $1", [r.grant_id]);
    const next = await reserve(student, r.grant_id);
    assert.equal(next.status, 'insufficient_credits');
    assert.equal(next.remaining_credits, 0);
});

await test('people without a school and embed keys still pay personally', async () => {
    await setPool(50, 0);
    const r = await reserve(loner);
    assert.equal(r.status, 'charged');
    assert.equal((await one('SELECT credits FROM public.users WHERE id = $1', [loner])).credits, 15);
    assert.equal((await finalize(loner, r, false)).status, 'refunded');
    assert.equal((await one('SELECT credits FROM public.users WHERE id = $1', [loner])).credits, 20);

    await db.query('UPDATE public.users SET credits = 10 WHERE id = $1', [owner]);
    const keyed = await reserve(owner, null, id(99));
    assert.equal(keyed.status, 'charged');
    assert.equal((await one('SELECT credits FROM public.users WHERE id = $1', [owner])).credits, 5);
    assert.equal((await pool()).credits, 50);
});

await test('live classes are paid one minute ahead from the school pool', async () => {
    await setPool(2, 0);
    await db.query(`INSERT INTO public.live_class_events (id, organizer_id, organization_id) VALUES ($1, $2, $3), ($4, $5, NULL)`, [event, teacher, school, personalEvent, loner]);
    const session = (await one('INSERT INTO public.learning_sessions (live_class_event_id) VALUES ($1) RETURNING id', [event])).id;
    const bill = () => one('SELECT * FROM public.bill_live_class_minute($1, 30)', [session]);

    const first = await bill();
    assert.deepEqual([first.status, first.payer, first.remaining_credits], ['charged', 'school', 1]);
    assert.equal((await bill()).status, 'prepaid', 'a second join inside the paid minute costs nothing');

    await db.query("UPDATE public.live_class_billing SET paid_until = now() + interval '10 seconds' WHERE session_id = $1", [session]);
    const second = await bill();
    assert.equal(second.status, 'charged');
    assert.ok(new Date(second.paid_until) - Date.now() > 60_000, 'the next minute starts where the paid one ends');

    await db.query("UPDATE public.live_class_billing SET paid_until = now() WHERE session_id = $1", [session]);
    assert.equal((await bill()).status, 'insufficient_credits');
    assert.equal((await one('SELECT minutes_charged FROM public.live_class_billing WHERE session_id = $1', [session])).minutes_charged, 2);
});

await test('a live class outside a school is paid by its organizer', async () => {
    await db.query('UPDATE public.users SET credits = 3 WHERE id = $1', [loner]);
    const session = (await one('INSERT INTO public.learning_sessions (live_class_event_id) VALUES ($1) RETURNING id', [personalEvent])).id;
    const r = await one('SELECT * FROM public.bill_live_class_minute($1, 30)', [session]);
    assert.deepEqual([r.status, r.payer, r.remaining_credits], ['charged', 'personal', 2]);
    const missing = await one('SELECT * FROM public.bill_live_class_minute($1, 30)', [id(98)]);
    assert.equal(missing.status, 'not_found');
});

const reserveAi = (category, ref, qty = 1, org = school, userId = teacher) => asServiceRole(() =>
    one('SELECT * FROM public.reserve_organization_ai_usage($1, $2, $3, $4, $5)', [org, userId, category, qty, ref]));

await test('lesson visuals are free within the allowance and cost credits after it', async () => {
    await setPool(10, 0);
    await db.exec(`INSERT INTO public.organization_ai_quotas (organization_id) VALUES ('${school}') ON CONFLICT DO NOTHING;
                   UPDATE public.organization_ai_quotas SET free_interactive_allowance = 2, free_image_allowance = 1 WHERE organization_id = '${school}'`);
    await reserveAi('interactive_generation', 'v1');
    await reserveAi('interactive_generation', 'v2');
    assert.equal((await pool()).credits, 10);
    await reserveAi('interactive_generation', 'v3');
    assert.equal((await pool()).credits, 9, 'one visual past the allowance costs 1 credit');
    await reserveAi('interactive_generation', 'v3');
    assert.equal((await pool()).credits, 9, 'the same request is not charged twice');

    await reserveAi('image_generation', 'i1');
    await reserveAi('image_generation', 'i2');
    assert.equal((await pool()).credits, 7, 'an image past the allowance costs 2 credits');

    await reserveAi('interactive_generation', 'creative-concept:o1:x');
    assert.equal((await pool()).credits, 7, 'creative-concept suggestions are free');
    await reserveAi('quiz_generation', 'q1');
    assert.equal((await pool()).credits, 7, 'structured quizzes stay free');
    const charged = await rows(`SELECT reference_id, credits_charged FROM public.organization_ai_usage WHERE credits_charged > 0 ORDER BY reference_id`);
    assert.deepEqual(charged, [{ reference_id: 'i2', credits_charged: 2 }, { reference_id: 'v3', credits_charged: 1 }]);
});

await test('authoring past the allowance with an empty pool is refused', async () => {
    await setPool(1, 0);
    await assert.rejects(reserveAi('image_generation', 'i3'), /SCHOOL_CREDITS_EXHAUSTED/);
    assert.equal((await one(`SELECT count(*)::int AS n FROM public.organization_ai_usage WHERE reference_id = 'i3'`)).n, 0);
    assert.equal((await pool()).credits, 1);
});

await test('a failed generation job gives back its credits and its allowance slot', async () => {
    await setPool(5, 0, 'NULL');
    await reserveAi('interactive_generation', 'v4');
    assert.equal((await pool()).credits, 4);
    const job = (await one(`INSERT INTO public.content_jobs (requested_by, organization_id, idempotency_key) VALUES ($1, $2, 'v4') RETURNING id`, [teacher, school])).id;
    await db.query(`UPDATE public.content_jobs SET status = 'running' WHERE id = $1`, [job]);
    assert.equal((await pool()).credits, 4);
    await db.query(`UPDATE public.content_jobs SET status = 'failed' WHERE id = $1`, [job]);
    assert.equal((await pool()).credits, 5);
    await db.query(`UPDATE public.content_jobs SET status = 'failed' WHERE id = $1`, [job]);
    assert.equal((await pool()).credits, 5, 'refunded only once');
    await reserveAi('interactive_generation', 'v5');
    assert.equal((await pool()).credits, 4, 'the slot freed by the failure is charged again past the allowance');
});

await test('developer organizations are never charged for authoring', async () => {
    await db.query(`INSERT INTO public.organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`, [devOrg, devOwner]);
    for (let i = 0; i < 3; i++) await reserveAi('image_generation', `d${i}`, 1, devOrg, devOwner);
    assert.equal((await pool(devOrg)).credits, 5);
});

await test('school admins cannot raise their own free allowance', async () => {
    await assert.rejects(
        asUser(owner, () => db.query(`UPDATE public.organization_ai_quotas SET free_image_allowance = 100000 WHERE organization_id = $1`, [school])),
        /set by the platform/,
    );
    await asUser(owner, () => db.query(`UPDATE public.organization_ai_quotas SET monthly_image_limit = 10 WHERE organization_id = $1`, [school]));
    assert.equal((await one('SELECT monthly_image_limit FROM public.organization_ai_quotas WHERE organization_id = $1', [school])).monthly_image_limit, 10);
});
