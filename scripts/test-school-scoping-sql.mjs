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

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = id(1);
const teacherA = id(2);
const studentA = id(3);
const learner = id(4);
const ownerB = id(5);
const teacherB = id(6);
const studentB = id(7);
const developerOrg = id(20);

// A minimal copy of the tables and helpers the migration builds on.
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

    CREATE TABLE public.users (id uuid PRIMARY KEY, role text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.admins (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id));
    CREATE TABLE public.organizations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, description text,
      owner_id uuid NOT NULL REFERENCES public.users(id), settings jsonb DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.organization_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES public.users(id),
      role text NOT NULL CONSTRAINT organization_members_role_check CHECK (role IN ('owner', 'admin', 'member')),
      joined_at timestamptz NOT NULL DEFAULT now(), invitation_accepted_at timestamptz,
      is_active boolean NOT NULL DEFAULT true, UNIQUE (organization_id, user_id));
    CREATE FUNCTION public.create_organization_owner_member() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO organization_members (organization_id, user_id, role, is_active) VALUES (NEW.id, NEW.owner_id, 'owner', true);
      RETURN NEW;
    END; $$;
    CREATE TRIGGER organization_created_trigger AFTER INSERT ON public.organizations
      FOR EACH ROW EXECUTE FUNCTION public.create_organization_owner_member();

    CREATE TABLE public.students (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id), grade text NOT NULL);
    CREATE TABLE public.teachers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id));
    CREATE TABLE public.grades (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), level text NOT NULL);
    CREATE TABLE public.timetables (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), grade text NOT NULL);
    CREATE TABLE public.assessments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), gradelevel text NOT NULL, createdby uuid, teacher_id uuid);
    CREATE TABLE public.live_class_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organizer_id uuid NOT NULL, grade_level text);
    CREATE TABLE public.lessons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, gradelevel text, teacher_id uuid, organization_id uuid REFERENCES public.organizations(id));
    CREATE TABLE public.lesson_content (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lesson_id uuid NOT NULL REFERENCES public.lessons(id));

    CREATE FUNCTION public.block_lesson_reassignment() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.organization_id IS DISTINCT FROM NEW.organization_id AND auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Not authorized to reassign lesson organization';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER lessons_organization_reassignment_guard BEFORE UPDATE OF organization_id ON public.lessons
      FOR EACH ROW EXECUTE FUNCTION public.block_lesson_reassignment();

    CREATE FUNCTION public.is_teacher() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
      $$ SELECT EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'teacher') $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
      $$ SELECT EXISTS (SELECT 1 FROM admins a WHERE a.user_id = auth.uid()) $$;
    CREATE FUNCTION public.can_manage_lesson(p_lesson_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM lessons l JOIN teachers t ON t.id = l.teacher_id WHERE l.id = p_lesson_id AND t.user_id = auth.uid())
    $$;

    DO $$ DECLARE t text; BEGIN
      FOREACH t IN ARRAY ARRAY['users','students','teachers','grades','timetables','assessments','live_class_events','lessons','lesson_content'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
      END LOOP;
    END $$;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    -- Own-row policies that already exist in production.
    CREATE POLICY users_select_own ON public.users FOR SELECT USING (id = auth.uid());
    CREATE POLICY students_select_own ON public.students FOR SELECT USING (user_id = auth.uid());
    CREATE POLICY teachers_select_own ON public.teachers FOR SELECT USING (user_id = auth.uid());

    -- Existing data from before schools: one admin, a teacher with a lesson,
    -- a student, and a self-signup learner with no student row.
    INSERT INTO public.users (id, role, created_at) VALUES
      ('${admin}', 'admin', now() - interval '1 day'), ('${teacherA}', 'teacher', now()), ('${studentA}', 'student', now()),
      ('${learner}', 'student', now()), ('${ownerB}', 'learner', now()), ('${teacherB}', 'teacher', now()), ('${studentB}', 'student', now());
    INSERT INTO public.admins (user_id) VALUES ('${admin}');
    INSERT INTO public.organizations (id, name, owner_id) VALUES ('${developerOrg}', 'API keys', '${ownerB}');
    INSERT INTO public.teachers (id, user_id) VALUES ('${id(30)}', '${teacherA}');
    INSERT INTO public.students (user_id, grade) VALUES ('${studentA}', 'Grade 5');
    INSERT INTO public.lessons (id, title, gradelevel, teacher_id) VALUES ('${id(40)}', 'Fractions', 'Grade 5', '${id(30)}');
    INSERT INTO public.lesson_content (lesson_id) VALUES ('${id(40)}');
    INSERT INTO public.timetables (grade) VALUES ('Grade 5');
    INSERT INTO public.live_class_events (organizer_id, grade_level) VALUES ('${teacherA}', 'Grade 5');
`);

const migration = (await readdir(path.join(root, 'supabase/migrations'))).find((name) => name.endsWith('_school_scoping.sql'));
assert.ok(migration, 'school_scoping migration must exist');
await db.exec(await readFile(path.join(root, 'supabase/migrations', migration), 'utf8'));

const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await rows(sql, params))[0];
const asUser = async (userId, fn) => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId}', false); SELECT set_config('request.jwt.claim.role', 'authenticated', false);`);
    try {
        return await fn();
    } finally {
        await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false); SELECT set_config('request.jwt.claim.role', '', false);`);
    }
};

const schoolA = (await one('SELECT id FROM public.organizations WHERE is_default_school')).id;
let schoolB;

await test('backfill moves existing data into one default school owned by the first admin', async () => {
    const school = await one('SELECT owner_id, type FROM public.organizations WHERE id = $1', [schoolA]);
    assert.deepEqual(school, { owner_id: admin, type: 'school' });
    assert.equal((await one('SELECT type FROM public.organizations WHERE id = $1', [developerOrg])).type, 'developer');

    const members = await rows('SELECT user_id, role FROM public.organization_members WHERE organization_id = $1 ORDER BY user_id', [schoolA]);
    assert.deepEqual(members, [
        { user_id: admin, role: 'owner' },
        { user_id: teacherA, role: 'teacher' },
        { user_id: studentA, role: 'student' },
    ]);

    for (const table of ['students', 'teachers', 'lessons', 'timetables', 'live_class_events']) {
        const { missing } = await one(`SELECT count(*)::int AS missing FROM public.${table} WHERE organization_id IS DISTINCT FROM $1`, [schoolA]);
        assert.equal(missing, 0, `${table} rows should all belong to the default school`);
    }
    assert.equal(await one('SELECT public.user_school_id($1) AS s', [learner]).then((r) => r.s), null);
});

await test('new rows pick up their school and create the matching membership', async () => {
    await db.exec(`INSERT INTO public.organizations (id, name, owner_id, type) VALUES ('${id(21)}', 'Hilltop School', '${ownerB}', 'school')`);
    schoolB = id(21);
    await db.exec(`INSERT INTO public.teachers (id, user_id, organization_id) VALUES ('${id(31)}', '${teacherB}', '${schoolB}')`);
    await db.exec(`INSERT INTO public.students (user_id, grade, organization_id) VALUES ('${studentB}', 'Grade 5', '${schoolB}')`);
    await db.exec(`INSERT INTO public.lessons (id, title, gradelevel, teacher_id) VALUES ('${id(41)}', 'Hilltop fractions', 'Grade 5', '${id(31)}')`);
    await db.exec(`INSERT INTO public.timetables (grade, organization_id) VALUES ('Grade 5', '${schoolB}')`);

    assert.equal((await one('SELECT organization_id FROM public.lessons WHERE id = $1', [id(41)])).organization_id, schoolB);
    assert.equal((await one('SELECT role FROM public.organization_members WHERE user_id = $1', [teacherB])).role, 'teacher');
    assert.equal((await one('SELECT public.user_school_id($1) AS s', [studentB])).s, schoolB);

    // No school given and no linked person in a school: falls back to the default school.
    await db.exec(`INSERT INTO public.grades (level) VALUES ('Grade 6')`);
    assert.equal((await one(`SELECT organization_id FROM public.grades WHERE level = 'Grade 6'`)).organization_id, schoolA);
});

await test('a person cannot join a second school', async () => {
    await assert.rejects(
        db.query(`INSERT INTO public.organization_members (organization_id, user_id, role) VALUES ($1, $2, 'student')`, [schoolB, studentA]),
        /already belongs to another school/,
    );
    // Developer organizations are not schools, so school members may still join them.
    await db.query(`INSERT INTO public.organization_members (organization_id, user_id, role) VALUES ($1, $2, 'member')`, [developerOrg, teacherA]);
    assert.equal((await one('SELECT public.user_school_id($1) AS s', [teacherA])).s, schoolA);
});

await test('teachers and students only read their own school', async () => {
    const lessonsFor = (userId) => asUser(userId, () => rows('SELECT title FROM public.lessons ORDER BY title'));
    assert.deepEqual(await lessonsFor(teacherA), [{ title: 'Fractions' }]);
    assert.deepEqual(await lessonsFor(studentA), [{ title: 'Fractions' }]);
    assert.deepEqual(await lessonsFor(teacherB), [{ title: 'Hilltop fractions' }]);
    assert.deepEqual(await lessonsFor(studentB), [{ title: 'Hilltop fractions' }]);
    assert.deepEqual(await lessonsFor(learner), []);

    const studentsFor = (userId) => asUser(userId, () => rows('SELECT user_id FROM public.students ORDER BY user_id'));
    assert.deepEqual(await studentsFor(teacherA), [{ user_id: studentA }]);
    assert.deepEqual(await studentsFor(teacherB), [{ user_id: studentB }]);

    const timetablesFor = (userId) => asUser(userId, () => rows('SELECT organization_id FROM public.timetables'));
    assert.deepEqual(await timetablesFor(studentA), [{ organization_id: schoolA }]);
    assert.deepEqual(await timetablesFor(studentB), [{ organization_id: schoolB }]);

    const contentFor = (userId) => asUser(userId, () => rows('SELECT lesson_id FROM public.lesson_content'));
    assert.equal((await contentFor(studentA)).length, 1);
    assert.equal((await contentFor(studentB)).length, 0);
});

await test('live-class grade lookup stays inside one school', async () => {
    const ids = async (school) => (await rows('SELECT * FROM public.student_user_ids_for_grade_level($1, $2) AS id', ['grade 5', school])).map((r) => r.id);
    assert.deepEqual(await ids(schoolA), [studentA]);
    assert.deepEqual(await ids(schoolB), [studentB]);
});
