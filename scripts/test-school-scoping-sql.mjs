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
const unconfirmed = id(8);
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
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email_confirmed_at timestamptz);

    CREATE TABLE public.users (id uuid PRIMARY KEY, role text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.admins (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id));
    CREATE TABLE public.organizations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, description text,
      owner_id uuid NOT NULL REFERENCES public.users(id), settings jsonb DEFAULT '{}',
      credits integer NOT NULL DEFAULT 0, total_credits_purchased integer NOT NULL DEFAULT 0,
      total_credits_used integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
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
    -- Organization policies as they are in production before school registration.
    ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations, public.organization_members TO authenticated;
    CREATE POLICY organizations_select_member ON public.organizations FOR SELECT USING (auth.uid() = owner_id);
    CREATE POLICY organizations_insert_own ON public.organizations FOR INSERT WITH CHECK (auth.uid() = owner_id);
    CREATE POLICY organizations_update_owner ON public.organizations FOR UPDATE USING (auth.uid() = owner_id);
    CREATE POLICY organization_members_select_member ON public.organization_members FOR SELECT USING (user_id = auth.uid());
    CREATE POLICY organization_members_insert_admin ON public.organization_members FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_members.organization_id AND o.owner_id = auth.uid()));
    CREATE POLICY organization_members_update_admin ON public.organization_members FOR UPDATE USING (
      EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_members.organization_id AND o.owner_id = auth.uid()));
    -- Own-row policies that already exist in production.
    CREATE POLICY users_select_own ON public.users FOR SELECT USING (id = auth.uid());
    CREATE POLICY students_select_own ON public.students FOR SELECT USING (user_id = auth.uid());
    CREATE POLICY teachers_select_own ON public.teachers FOR SELECT USING (user_id = auth.uid());
    -- Policies the migration rewrites in place. They start wide open here, so a
    -- policy the migration forgot to change would fail the isolation tests.
    DO $$ DECLARE p text[]; BEGIN
      FOREACH p SLICE 1 IN ARRAY ARRAY[
        ['lessons_teacher_select','lessons'], ['lessons_student_select','lessons'],
        ['lesson_content_teacher_select','lesson_content'], ['lesson_content_student_select','lesson_content'],
        ['students_teacher_select','students'], ['teachers_student_view_basic','teachers'],
        ['timetables_teacher_select','timetables'], ['timetables_student_select','timetables'],
        ['grades_select_all','grades'], ['assessments_teacher_select','assessments'],
        ['assessments_student_select','assessments'], ['users_teacher_view_students','users'],
        ['users_select_basic_public_info','users']] LOOP
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', p[1], p[2]);
      END LOOP;
    END $$;

    -- Existing data from before schools: one admin, a teacher with a lesson,
    -- a student, and a self-signup learner with no student row.
    INSERT INTO public.users (id, role, created_at) VALUES
      ('${admin}', 'admin', now() - interval '1 day'), ('${teacherA}', 'teacher', now()), ('${studentA}', 'student', now()),
      ('${learner}', 'student', now()), ('${ownerB}', 'learner', now()), ('${teacherB}', 'teacher', now()), ('${studentB}', 'student', now()),
      ('${unconfirmed}', 'student', now());
    INSERT INTO auth.users (id, email_confirmed_at)
      SELECT id, CASE WHEN id = '${unconfirmed}' THEN NULL ELSE now() END FROM public.users;
    INSERT INTO public.admins (user_id) VALUES ('${admin}');
    INSERT INTO public.organizations (id, name, owner_id) VALUES ('${developerOrg}', 'API keys', '${ownerB}');
    INSERT INTO public.teachers (id, user_id) VALUES ('${id(30)}', '${teacherA}');
    INSERT INTO public.students (user_id, grade) VALUES ('${studentA}', 'Grade 5');
    INSERT INTO public.lessons (id, title, gradelevel, teacher_id) VALUES ('${id(40)}', 'Fractions', 'Grade 5', '${id(30)}');
    INSERT INTO public.lesson_content (lesson_id) VALUES ('${id(40)}');
    INSERT INTO public.timetables (grade) VALUES ('Grade 5');
    INSERT INTO public.live_class_events (organizer_id, grade_level) VALUES ('${teacherA}', 'Grade 5');
`);

// Production ran school scoping in eight steps, one file per recorded version.
const migrationFiles = (await readdir(path.join(root, 'supabase/migrations'))).sort();
const scopingSteps = migrationFiles.filter((name) => /^\d{14}_school_scoping_\d/.test(name));
assert.equal(scopingSteps.length, 8, 'school scoping steps must all exist');
for (const name of scopingSteps) {
    await db.exec(await readFile(path.join(root, 'supabase/migrations', name), 'utf8'));
}

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

// ---------------------------------------------------------------------------
// Fixes after review, then school registration
// ---------------------------------------------------------------------------
const migrationNamed = async (suffix) => {
    const name = (await readdir(path.join(root, 'supabase/migrations'))).find((file) => file.endsWith(suffix));
    assert.ok(name, `${suffix} migration must exist`);
    return readFile(path.join(root, 'supabase/migrations', name), 'utf8');
};

// A lesson saved under a developer organization before the fix.
await db.exec(`INSERT INTO public.lessons (id, title, gradelevel, teacher_id, organization_id) VALUES ('${id(42)}', 'Old org lesson', 'Grade 5', '${id(30)}', '${developerOrg}')`);
await db.exec(await migrationNamed('_school_scoping_fixes.sql'));
await db.exec(await migrationNamed('_school_registration.sql'));
await db.exec(await migrationNamed('_school_registration_guardrails.sql'));

await test('lessons never stay under a developer organization', async () => {
    assert.equal((await one('SELECT organization_id FROM public.lessons WHERE id = $1', [id(42)])).organization_id, schoolA);
    await db.exec(`INSERT INTO public.lessons (id, title, gradelevel, teacher_id, organization_id) VALUES ('${id(43)}', 'New org lesson', 'Grade 5', '${id(31)}', '${developerOrg}')`);
    assert.equal((await one('SELECT organization_id FROM public.lessons WHERE id = $1', [id(43)])).organization_id, schoolB);
});

await test('account details are only visible to people who share a school or organization', async () => {
    const usersFor = (userId) => asUser(userId, async () => (await rows('SELECT id FROM public.users ORDER BY id')).map((r) => r.id));
    assert.deepEqual(await usersFor(learner), [learner]);
    assert.deepEqual(await usersFor(studentB), [ownerB, teacherB, studentB]);
    // teacherA is in school A and, as a member, in ownerB's developer organization.
    assert.deepEqual(await usersFor(ownerB), [teacherA, ownerB, teacherB, studentB]);
    assert.ok(!(await usersFor(teacherA)).includes(studentB));
});

const register = (userId, name = 'Riverside School', grades = ['primary 1']) =>
    asUser(userId, () => one('SELECT public.register_school($1, $2, $3, $4) AS id', [name, 'Ghana', 'Africa/Accra', grades]));

await test('a confirmed self-signup can register one school and becomes its owner', async () => {
    const { id: school } = await register(learner);
    const row = await one('SELECT type, owner_id, country, timezone, grade_levels, is_default_school FROM public.organizations WHERE id = $1', [school]);
    assert.deepEqual(row, { type: 'school', owner_id: learner, country: 'Ghana', timezone: 'Africa/Accra', grade_levels: ['primary 1'], is_default_school: false });
    assert.equal((await one('SELECT role FROM public.organization_members WHERE organization_id = $1 AND user_id = $2', [school, learner])).role, 'owner');
    assert.equal((await one('SELECT role FROM public.users WHERE id = $1', [learner])).role, 'learner');
    assert.equal((await one('SELECT public.user_school_id($1) AS s', [learner])).s, school);

    await assert.rejects(register(learner, 'Second school'), /already belong to a school/);
});

await test('registration refuses unconfirmed emails, platform admins and current school members', async () => {
    await assert.rejects(register(unconfirmed), /Confirm your email/);
    await assert.rejects(register(admin), /Platform admin/);
    await assert.rejects(register(studentA), /already teaches or studies/);
    await assert.rejects(register(teacherB), /already teaches or studies/);
    await assert.rejects(register(unconfirmed, ' '), /Confirm your email/);
    await assert.rejects(asUser(learner, () => one(`SELECT public.register_school('x')`)), /already belong|2 to 120/);
});

await test('schools cannot be created or changed by writing to the tables directly', async () => {
    await assert.rejects(
        asUser(unconfirmed, () => db.query(`INSERT INTO public.organizations (name, owner_id, type) VALUES ('Fake', $1, 'school')`, [unconfirmed])),
        /row-level security/,
    );
    await assert.rejects(
        asUser(unconfirmed, () => db.query(`INSERT INTO public.organizations (name, owner_id, credits) VALUES ('Rich', $1, 1000)`, [unconfirmed])),
        /row-level security/,
    );
    // Developer organizations still work, including the owner membership trigger.
    await asUser(unconfirmed, () => db.query(`INSERT INTO public.organizations (id, name, owner_id) VALUES ($1, 'My app', $2)`, [id(22), unconfirmed]));
    assert.equal((await one('SELECT role FROM public.organization_members WHERE organization_id = $1', [id(22)])).role, 'owner');

    const school = (await one('SELECT public.user_school_id($1) AS s', [learner])).s;
    await assert.rejects(asUser(learner, () => db.query(`UPDATE public.organizations SET type = 'developer' WHERE id = $1`, [school])), /permission denied/);
    await asUser(learner, () => db.query(`UPDATE public.organizations SET name = 'Riverside Academy', grade_levels = '{jhs 1}' WHERE id = $1`, [school]));
    assert.equal((await one('SELECT name FROM public.organizations WHERE id = $1', [school])).name, 'Riverside Academy');

    // An owner cannot pull other accounts into their school; invites will do that.
    await assert.rejects(
        asUser(learner, () => db.query(`INSERT INTO public.organization_members (organization_id, user_id, role) VALUES ($1, $2, 'student')`, [school, unconfirmed])),
        /row-level security/,
    );
});

await test('grade lookups are closed to signed-in callers', async () => {
    await assert.rejects(
        asUser(teacherA, () => rows(`SELECT * FROM public.student_user_ids_for_grade_level('grade 5', $1)`, [schoolA])),
        /permission denied/,
    );
});
