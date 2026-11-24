import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE
    ? pathToFileURL(process.env.PGLITE_MODULE).href
    : '@electric-sql/pglite');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
const student = '00000000-0000-4000-8000-0000000000c1';
const other = '00000000-0000-4000-8000-0000000000c2';
const session = '00000000-0000-4000-8000-0000000000d1';
const session2 = '00000000-0000-4000-8000-0000000000d2';

await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.users (id uuid PRIMARY KEY);
    CREATE TABLE public.learning_sessions (id uuid PRIMARY KEY, user_id uuid REFERENCES public.users(id) ON DELETE CASCADE);
    INSERT INTO public.users VALUES ('${student}'), ('${other}');
    INSERT INTO public.learning_sessions VALUES ('${session}', '${student}'), ('${session2}', '${other}');
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
`);
const migration = await readFile(path.join(root, 'supabase/migrations/20261124183240_lesson_notes.sql'), 'utf8');
await db.exec(migration);

const rejects = (statement, label) => assert.rejects(() => db.exec(statement), undefined, label);
const add = (who, where, notes = '{"pages":[],"cards":[]}', extra = '') =>
    `INSERT INTO public.lesson_notes (student_id, learning_session_id, notes${extra ? ', ' + extra.split('=')[0] : ''}) VALUES ('${who}', '${where}', '${notes}'${extra ? ', ' + extra.split('=')[1] : ''})`;

test('the migration can run twice', async () => {
    await db.exec(migration);
});

test('only the server can touch lesson notes', async () => {
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        await rejects('SELECT 1 FROM public.lesson_notes', `${role} read`);
        await rejects(add(student, session), `${role} write`);
        await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    await db.exec(add(student, session));
    await db.exec('RESET ROLE');
    const rls = await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname = 'lesson_notes'`);
    assert.equal(rls.rows[0].relrowsecurity, true);
});

test('a session has one set of notes', async () => {
    await assert.rejects(() => db.exec(add(student, session)), (error) => error.code === '23505');
});

test('notes must be an object of a sensible size, with a believable score', async () => {
    await rejects(add(other, session2, '[]'), 'array');
    await rejects(add(other, session2, JSON.stringify({ pages: 'x'.repeat(400001) })), 'too large');
    await rejects(add(other, session2, '{}', 'checks_correct=3'), 'more right than answered');
    await rejects(add(other, session2, '{}', 'topic=repeat(\'t\', 201)'), 'long topic');
    await db.exec(add(other, session2, '{}'));
});

test('notes go when the session or the student goes', async () => {
    await db.exec(`DELETE FROM public.learning_sessions WHERE id = '${session2}'`);
    await db.exec(`DELETE FROM public.users WHERE id = '${student}'`);
    const left = await db.query('SELECT count(*)::int AS n FROM public.lesson_notes');
    assert.equal(left.rows[0].n, 0);
});
