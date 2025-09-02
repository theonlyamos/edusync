-- Enable extensions commonly used for UUID generation
create extension if not exists pgcrypto;

-- Users
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password text,
  name text not null,
  role text not null check (role in ('admin','teacher','student')),
  isActive boolean not null default true,
  lastLogin timestamptz,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now()
);

-- Students
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  grade text not null,
  guardianName text,
  guardianContact text,
  enrollment_date timestamptz,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  unique(user_id)
);

-- Teachers
create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subjects text[] not null default '{}',
  grades text[] not null default '{}',
  qualifications text[] not null default '{}',
  specializations text[] not null default '{}',
  joinDate timestamptz,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  unique(user_id)
);

-- Admins
create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  permissions text[] not null default '{}',
  isSuperAdmin boolean not null default false,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now(),
  unique(user_id)
);

-- Grades (class levels)
create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  level text not null unique,
  name text not null,
  description text,
  subjects text[] not null default '{}',
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now()
);

-- Lessons
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  gradeLevel text,
  objectives text[],
  content text,
  teacher uuid references public.users(id) on delete set null,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now()
);

-- Lesson content
create table if not exists public.lesson_content (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  type text not null check (type in ('quiz','worksheet','explanation','summary')),
  content jsonb not null,
  createdAt timestamptz not null default now()
);

-- Timetables
create table if not exists public.timetables (
  id uuid primary key default gen_random_uuid(),
  grade text not null,
  academicYear text,
  term text,
  effectiveFrom timestamptz,
  isActive boolean not null default true,
  periods jsonb,        -- array of {id, startTime, endTime, ...}
  schedule jsonb,       -- nested day -> periodId -> {subject, teacherId, lessonId, ...}
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now()
);

-- Assessments
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  subject text not null,
  gradeLevel text not null,
  type text not null,
  duration int not null,
  totalPoints int not null,
  passingScore int not null,
  questions jsonb not null,
  createdBy uuid references public.users(id) on delete set null,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now()
);

-- Assessment results
create table if not exists public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  assessmentId uuid not null references public.assessments(id) on delete cascade,
  studentId uuid not null references public.users(id) on delete cascade,
  answers jsonb not null,
  score int,
  percentage numeric,
  status text,
  startedAt timestamptz,
  submittedAt timestamptz,
  timeSpent int
);

-- Chats
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  userId uuid not null references public.users(id) on delete cascade,
  lessonId uuid references public.lessons(id) on delete set null,
  title text,
  messages jsonb not null default '[]'::jsonb,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now()
);

-- Practice results
create table if not exists public.practice_results (
  id uuid primary key default gen_random_uuid(),
  studentId uuid not null references public.users(id) on delete cascade,
  subject text not null,
  topic text not null,
  score jsonb not null,     -- { earnedPoints, totalPoints, percentage }
  results jsonb not null,   -- array of per-question results
  completedAt timestamptz not null default now()
);

-- Student stats (aggregates for practice)
create table if not exists public.student_stats (
  studentId uuid primary key references public.users(id) on delete cascade,
  totalExercisesCompleted int not null default 0,
  totalPointsEarned int not null default 0,
  recentScores numeric[] not null default '{}',
  lastPracticeDate timestamptz,
  createdAt timestamptz not null default now(),
  updatedAt timestamptz not null default now()
);

-- Useful views
create or replace view public.students_view as
  select
    u.id,
    u.email,
    u.name,
    s.grade,
    u.isActive,
    u.createdAt,
    u.updatedAt
  from public.users u
  join public.students s on s.user_id = u.id
  where u.role = 'student';

create or replace view public.teachers_view as
  select
    u.id,
    u.email,
    u.name,
    t.subjects,
    t.grades,
    t.qualifications,
    t.specializations,
    u.isActive,
    u.createdAt,
    u.updatedAt
  from public.users u
  join public.teachers t on t.user_id = u.id
  where u.role = 'teacher';

-- Triggers to keep updatedAt fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_users_updated_at') then
    create trigger set_users_updated_at before update on public.users
    for each row execute function public.set_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'set_teachers_updated_at') then
    create trigger set_teachers_updated_at before update on public.teachers
    for each row execute function public.set_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'set_students_updated_at') then
    create trigger set_students_updated_at before update on public.students
    for each row execute function public.set_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'set_assessments_updated_at') then
    create trigger set_assessments_updated_at before update on public.assessments
    for each row execute function public.set_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'set_timetables_updated_at') then
    create trigger set_timetables_updated_at before update on public.timetables
    for each row execute function public.set_updated_at();
  end if;
end $$;


