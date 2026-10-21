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
const lesson = '00000000-0000-4000-8000-000000000001';

await db.exec(`
    CREATE TABLE public.lessons (id uuid PRIMARY KEY, title text, subject text, gradelevel text, content text,
      objectives text[], visual_instructions text NOT NULL DEFAULT '', visual_revision integer NOT NULL DEFAULT 1);
    CREATE TABLE public.lesson_objectives (id serial PRIMARY KEY, lesson_id uuid, revision integer NOT NULL DEFAULT 1,
      archived_at timestamptz, updated_at timestamptz);
`);
await db.exec(await readFile(path.join(root, 'supabase/migrations/20261021200000_lesson_content_keeps_approvals.sql'), 'utf8'));
await db.exec(`
    CREATE TRIGGER lessons_visual_revision BEFORE UPDATE ON public.lessons
    FOR EACH ROW EXECUTE FUNCTION public.bump_lesson_visual_revision();
    INSERT INTO public.lessons (id, title, subject, gradelevel, content, objectives) VALUES ('${lesson}', 'Plants', 'Biology', 'jhs 1', 'Intro', ARRAY['a', 'b']);
    INSERT INTO public.lesson_objectives (lesson_id) VALUES ('${lesson}'), ('${lesson}');
`);

const revisions = async () => {
    const { rows: [row] } = await db.query(`SELECT visual_revision AS lesson,
      (SELECT array_agg(revision ORDER BY id) FROM public.lesson_objectives) AS objectives FROM public.lessons`);
    return row;
};

test('editing lesson content keeps every revision', async () => {
    await db.exec(`UPDATE public.lessons SET content = 'A longer, corrected introduction'`);
    assert.deepEqual(await revisions(), { lesson: 1, objectives: [1, 1] });
});

test('editing the objective list only outdates the lesson introduction', async () => {
    await db.exec(`UPDATE public.lessons SET objectives = ARRAY['b', 'a']`);
    assert.deepEqual(await revisions(), { lesson: 2, objectives: [1, 1] });
});

test('editing lesson directions outdates every objective', async () => {
    await db.exec(`UPDATE public.lessons SET visual_instructions = 'Use a Ghanaian farm'`);
    assert.deepEqual(await revisions(), { lesson: 3, objectives: [2, 2] });
});
