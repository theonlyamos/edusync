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
const event = '00000000-0000-4000-8000-0000000000e1';
const teacher = '00000000-0000-4000-8000-0000000000e2';
const student = '00000000-0000-4000-8000-0000000000e3';

await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE public.live_class_events (id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${teacher}'), ('${student}');
    INSERT INTO public.live_class_events VALUES ('${event}');
`);
const migration = await readFile(path.join(root, 'supabase/migrations/20261110130000_live_class_polls.sql'), 'utf8');
await db.exec(migration);
await db.exec(migration);

const newPoll = async (options = '["Yes","No","Maybe"]') => (await db.query(
    `INSERT INTO public.live_class_polls (live_class_event_id, created_by, question, options) VALUES ('${event}', '${teacher}', 'Ready?', '${options}') RETURNING id`,
)).rows[0].id;
const vote = async (poll, option, user = student) => (await db.query(`SELECT public.cast_live_class_poll_vote('${poll}', '${user}', ${option}) AS ok`)).rows[0].ok;

test('a class has one open poll at a time', async () => {
    const first = await newPoll();
    await assert.rejects(newPoll(), /live_class_polls_one_open_idx/);
    await db.exec(`UPDATE public.live_class_polls SET status = 'closed', closed_at = now() WHERE id = '${first}'`);
    const second = await newPoll();
    await db.exec(`UPDATE public.live_class_polls SET status = 'closed' WHERE id = '${second}'`);
});

test('a poll needs two to six answers', async () => {
    await assert.rejects(newPoll('["Only one"]'));
    await assert.rejects(newPoll('["1","2","3","4","5","6","7"]'));
    await assert.rejects(newPoll('{"a":1}'));
});

test('an answer counts once per student and can be changed while the poll is open', async () => {
    const poll = await newPoll();
    assert.equal(await vote(poll, 0), true);
    assert.equal(await vote(poll, 2), true);
    const { rows } = await db.query(`SELECT option_index FROM public.live_class_poll_votes WHERE poll_id = '${poll}'`);
    assert.deepEqual(rows, [{ option_index: 2 }]);
    assert.equal(await vote(poll, 3), false, 'not one of the options');
    assert.equal(await vote(poll, -1), false);
    await db.exec(`UPDATE public.live_class_polls SET status = 'closed' WHERE id = '${poll}'`);
    assert.equal(await vote(poll, 0), false, 'the poll has ended');
    assert.equal((await db.query(`SELECT option_index FROM public.live_class_poll_votes WHERE poll_id = '${poll}'`)).rows[0].option_index, 2);
    assert.equal(await vote('00000000-0000-4000-8000-0000000000ff', 0), false, 'no such poll');
});

test('browser roles cannot read polls, read answers or answer directly', async () => {
    const poll = (await db.query(`SELECT id FROM public.live_class_polls LIMIT 1`)).rows[0].id;
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        await assert.rejects(db.query('SELECT * FROM public.live_class_polls'), /permission denied/);
        await assert.rejects(db.query('SELECT * FROM public.live_class_poll_votes'), /permission denied/);
        await assert.rejects(db.query(`SELECT public.cast_live_class_poll_vote('${poll}', '${student}', 0)`), /permission denied/);
        await db.exec('RESET ROLE');
    }
});

test('polls and answers go when the class is deleted', async () => {
    await db.exec(`DELETE FROM public.live_class_events WHERE id = '${event}'`);
    assert.equal((await db.query('SELECT (SELECT count(*) FROM public.live_class_polls)::int + (SELECT count(*) FROM public.live_class_poll_votes)::int AS n')).rows[0].n, 0);
});
