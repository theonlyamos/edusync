import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE
    ? pathToFileURL(process.env.PGLITE_MODULE).href
    : '@electric-sql/pglite');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, 'supabase/migrations', file), 'utf8');
const db = new PGlite();

const school = '00000000-0000-4000-8000-0000000000a1';
const klass = '00000000-0000-4000-8000-0000000000c1';
const student = '00000000-0000-4000-8000-000000000001';
const parent = '00000000-0000-4000-8000-000000000002';

await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.organizations (id uuid PRIMARY KEY);
    CREATE TABLE public.users (id uuid PRIMARY KEY);
    CREATE TABLE public.school_classes (id uuid PRIMARY KEY);
    INSERT INTO public.organizations VALUES ('${school}');
    INSERT INTO public.users VALUES ('${student}'), ('${parent}');
    INSERT INTO public.school_classes VALUES ('${klass}');
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
`);
const notifications = await read('20261109204708_notifications.sql');
const records = await read('20261109220000_school_records.sql');
const kinds = await read('20261109220100_report_card_notifications.sql');
await db.exec(notifications);
await db.exec(records);
await db.exec(kinds);

const rejects = (statement, label) => assert.rejects(() => db.exec(statement), undefined, label);
const TABLES = ['attendance_records', 'report_cards', 'student_guardians'];

test('the migrations can run twice', async () => {
    await db.exec(records);
    await db.exec(kinds);
});

test('only the server can touch the tables', async () => {
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        for (const table of TABLES) await rejects(`SELECT 1 FROM public.${table}`, `${role} read ${table}`);
        await db.exec('RESET ROLE');
    }
    const rls = await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname = ANY($1) AND relnamespace = 'public'::regnamespace`, [TABLES]);
    assert.deepEqual(rls.rows.map((row) => row.relrowsecurity), [true, true, true]);
});

test('a student has one attendance mark per class per day', async () => {
    const add = (status, day = '2026-11-09') =>
        `INSERT INTO public.attendance_records (organization_id, class_id, student_id, day, status) VALUES ('${school}', '${klass}', '${student}', '${day}', '${status}')`;
    await db.exec(add('present'));
    await rejects(add('absent'), 'second mark on the same day');
    await rejects(add('asleep', '2026-11-10'), 'unknown status');
    await db.exec(add('late', '2026-11-10'));
});

test('a report card is unique per student and term, and its period runs forwards', async () => {
    const add = (term, start, end) =>
        `INSERT INTO public.report_cards (organization_id, student_id, class_id, term, period_start, period_end) VALUES ('${school}', '${student}', '${klass}', '${term}', '${start}', '${end}')`;
    await db.exec(add('Term 1', '2026-09-01', '2026-12-01'));
    await rejects(add('Term 1', '2026-09-01', '2026-12-01'), 'same term twice');
    await rejects(add('Term 2', '2026-12-01', '2026-09-01'), 'period backwards');
    // Deleting the class keeps the report card.
    await db.exec(`DELETE FROM public.school_classes`);
    assert.equal((await db.query(`SELECT class_id FROM public.report_cards`)).rows[0].class_id, null);
});

test('report card notifications are allowed, unknown kinds are not', async () => {
    await db.exec(`INSERT INTO public.notifications (user_id, kind, title) VALUES ('${parent}', 'report_card', 'Ready')`);
    await rejects(`INSERT INTO public.notifications (user_id, kind, title) VALUES ('${parent}', 'made_up', 'x')`, 'unknown kind');
});

test('a parent follows a student once, and the link goes when either account does', async () => {
    const add = `INSERT INTO public.student_guardians (organization_id, student_id, guardian_id) VALUES ('${school}', '${student}', '${parent}')`;
    await db.exec(add);
    await rejects(add, 'same link twice');
    await db.exec(`DELETE FROM public.users WHERE id = '${parent}'`);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.student_guardians`)).rows[0].n, 0);
});
