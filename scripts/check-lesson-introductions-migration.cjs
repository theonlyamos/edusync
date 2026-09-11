// Run: node scripts/check-lesson-introductions-migration.cjs <path-to-@electric-sql/pglite>
// The optional test runtime is not a project dependency; this uses an in-memory database only.
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
      CREATE TABLE public.users (id uuid PRIMARY KEY);
      CREATE TABLE public.lessons (
        id uuid PRIMARY KEY, title text, subject text, gradelevel text, content text,
        objectives text[], current_publication_id uuid, updated_at timestamptz DEFAULT now()
      );
      CREATE FUNCTION public.can_manage_lesson(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    `);
    const initial = readFileSync(resolve('supabase/migrations/0033_objective_artifacts.sql'), 'utf8');
    for (const table of ['lesson_objectives', 'lesson_artifacts', 'lesson_publications']) {
      const start = initial.indexOf(`CREATE TABLE IF NOT EXISTS public.${table} (`);
      await db.exec(initial.slice(start, initial.indexOf('\n);', start) + 3));
    }
    await db.exec(`CREATE FUNCTION public.save_lesson_authoring(uuid,text,text,text,text,jsonb)
      RETURNS SETOF public.lesson_objectives LANGUAGE sql AS $$ SELECT * FROM public.lesson_objectives WHERE false $$;`);
    await db.exec(readFileSync(resolve('supabase/migrations/0036_lesson_introductions.sql'), 'utf8'));
    const teacher = '00000000-0000-4000-8000-000000000001';
    const lesson = '00000000-0000-4000-8000-000000000002';
    const objective = '00000000-0000-4000-8000-000000000003';
    await db.query('INSERT INTO users VALUES ($1)', [teacher]);
    await db.query(`INSERT INTO lessons (id,title,subject,gradelevel,objectives) VALUES ($1,'Fractions','Math','4',ARRAY['Compare halves'])`, [lesson]);
    await db.query(`INSERT INTO lesson_objectives (id,lesson_id,text,position) VALUES ($1,$2,'Compare halves',0)`, [objective, lesson]);
    const saved = await db.query(`SELECT * FROM save_lesson_authoring($1,'Fractions','Math','4',NULL,$2::jsonb,'Draw pizza diagrams')`, [lesson, JSON.stringify([{ id: objective, text: 'Compare halves', position: 0, visualInstructions: 'Label the halves' }])]);
    assert.equal(saved.rows[0].visual_instructions, 'Label the halves');
    assert.equal(saved.rows[0].revision, 3);
    assert.equal((await db.query('SELECT visual_revision FROM lessons WHERE id=$1', [lesson])).rows[0].visual_revision, 2);
    // Older six-argument callers preserve visual instructions rather than clearing them.
    await db.query(`SELECT * FROM save_lesson_authoring($1,'Fractions','Math','4',NULL,$2::jsonb)`, [lesson, JSON.stringify([{ id: objective, text: 'Compare halves', position: 0 }])]);
    assert.equal((await db.query('SELECT visual_instructions FROM lesson_objectives WHERE id=$1', [objective])).rows[0].visual_instructions, 'Label the halves');
    const payload = (scope) => JSON.stringify({ kind: 'generated_image', introductionFor: scope, assetId: teacher, altText: 'Halves', caption: 'Two halves' });
    const generated = async (objectiveId, scope, previous) => (await db.query(`SELECT * FROM insert_generated_lesson_artifact($1,$2,$7,'generated_image',0,$3::jsonb,'{"status":"passed"}', '{}',$4,$5,$6)`, [lesson, objectiveId, payload(scope), teacher, previous?.series_id ?? null, previous?.id ?? null, objectiveId ? 3 : 2])).rows[0];
    const intro = await generated(null, 'lesson');
    const revised = await generated(null, 'lesson', intro);
    assert.equal(revised.version, 2);
    assert.equal(revised.objective_id, null);
    const objectiveIntro = await generated(objective, 'objective');
    await db.query(`UPDATE lesson_artifacts SET status='approved' WHERE id=ANY($1::uuid[])`, [[revised.id, objectiveIntro.id]]);
    const manifest = { lesson: { introductionArtifactId: revised.id, visualRevision: 2 }, objectives: [{ id: objective, revision: 3, text: 'Compare halves', introductionArtifactId: objectiveIntro.id, artifactIds: [objectiveIntro.id] }] };
    const publish = (value, version) => db.query(`SELECT * FROM publish_lesson_manifest($1,$2::jsonb,'[]',$3,$4)`, [lesson, JSON.stringify(value), String(version), teacher]);
    await assert.rejects(publish({ ...manifest, lesson: {} }, 1), /INTRODUCTION_REQUIRED/);
    await assert.rejects(publish({ ...manifest, objectives: [{ ...manifest.objectives[0], introductionArtifactId: intro.id }] }, 1), /INTRODUCTION_REQUIRED/);
    await publish(manifest, 1);
    await publish(manifest, 1); // Unchanged content can safely reuse its snapshot.
    await db.query(`UPDATE lessons SET visual_instructions='Use number lines' WHERE id=$1`, [lesson]);
    assert.equal((await db.query('SELECT revision FROM lesson_objectives WHERE id=$1', [objective])).rows[0].revision, 4);
    await assert.rejects(publish(manifest, 2), /INTRODUCTION_REQUIRED/);
    await assert.rejects(publish(manifest, 1), /INTRODUCTION_REQUIRED/); // Existing hashes must validate too.
    // Replacing only the lesson image cannot republish stale objective diagrams.
    const updatedLessonImage = (await db.query(`SELECT * FROM insert_generated_lesson_artifact($1,NULL,3,'generated_image',0,$2::jsonb,'{"status":"passed"}','{}',$3)`, [lesson, payload('lesson'), teacher])).rows[0];
    await db.query(`UPDATE lesson_artifacts SET status='approved' WHERE id=$1`, [updatedLessonImage.id]);
    await assert.rejects(publish({ ...manifest, lesson: { introductionArtifactId: updatedLessonImage.id, visualRevision: 3 } }, 2), /INTRODUCTION_REQUIRED/);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM lesson_publications')).rows[0].count, 1);
    console.log('Migration check passed: instruction persistence, revision invalidation, nullable lesson image versions, required approved introductions, legacy caller compatibility.');
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
