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
const student = '00000000-0000-4000-8000-0000000000b1';
const other = '00000000-0000-4000-8000-0000000000b2';

await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.users (id uuid PRIMARY KEY);
    INSERT INTO public.users VALUES ('${student}'), ('${other}');
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
`);
const migration = await readFile(path.join(root, 'supabase/migrations/20261110000000_flashcards.sql'), 'utf8');
await db.exec(migration);

const rejects = (statement, label) => assert.rejects(() => db.exec(statement), undefined, label);
const add = (who, front, back = 'A') => `INSERT INTO public.flashcards (student_id, front, back) VALUES ('${who}', '${front}', '${back}')`;

test('the migration can run twice', async () => {
    await db.exec(migration);
});

test('only the server can touch flashcards', async () => {
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        await rejects('SELECT 1 FROM public.flashcards', `${role} read`);
        await rejects(add(student, 'Q'), `${role} write`);
        await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    await db.exec(add(student, 'What is 2+2?', '4'));
    await db.exec('RESET ROLE');
    const rls = await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname = 'flashcards'`);
    assert.equal(rls.rows[0].relrowsecurity, true);
});

test('a student keeps one card per question, whatever the capitals', async () => {
    await assert.rejects(() => db.exec(add(student, 'WHAT IS 2+2?')), (error) => error.code === '23505');
    await db.exec(add(other, 'What is 2+2?'));
});

test('cards need a question, an answer and a box from 1 to 5', async () => {
    await rejects(add(student, ''), 'empty front');
    await rejects(add(student, 'Q2', ''), 'empty back');
    await rejects(`UPDATE public.flashcards SET box = 6`, 'box too high');
    await rejects(`UPDATE public.flashcards SET box = 0`, 'box too low');
    const fresh = await db.query(`SELECT box, due_on = CURRENT_DATE AS today, reviews FROM public.flashcards LIMIT 1`);
    assert.deepEqual(fresh.rows[0], { box: 1, today: true, reviews: 0 });
});

test('a student takes their cards with them', async () => {
    await db.exec(`DELETE FROM public.users WHERE id = '${student}'`);
    const left = await db.query(`SELECT count(*)::int AS n FROM public.flashcards WHERE student_id = '${student}'`);
    assert.equal(left.rows[0].n, 0);
});
