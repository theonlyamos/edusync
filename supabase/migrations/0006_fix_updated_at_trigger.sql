-- Fix the updated_at trigger function conflict and standardize on snake_case
-- The issue: Migration 0002 overwrote the function from 0001, changing "updatedat" to "updated_at"
-- Now standardizing all tables to use snake_case naming convention

-- Create a single function that uses snake_case naming convention
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Safely rename columns from camelCase to snake_case (only if they exist)
do $$ 
begin
    -- Users table
    if exists(select * from information_schema.columns where table_name='users' and column_name='createdat') then
        alter table public.users rename column "createdat" to created_at;
    end if;
    if exists(select * from information_schema.columns where table_name='users' and column_name='updatedat') then
        alter table public.users rename column "updatedat" to updated_at;
    end if;

    -- Students table
    if exists(select * from information_schema.columns where table_name='students' and column_name='createdat') then
        alter table public.students rename column "createdat" to created_at;
    end if;
    if exists(select * from information_schema.columns where table_name='students' and column_name='updatedat') then
        alter table public.students rename column "updatedat" to updated_at;
    end if;

    -- Teachers table
    if exists(select * from information_schema.columns where table_name='teachers' and column_name='createdat') then
        alter table public.teachers rename column "createdat" to created_at;
    end if;
    if exists(select * from information_schema.columns where table_name='teachers' and column_name='updatedat') then
        alter table public.teachers rename column "updatedat" to updated_at;
    end if;

    -- Admins table
    if exists(select * from information_schema.columns where table_name='admins' and column_name='createdat') then
        alter table public.admins rename column "createdat" to created_at;
    end if;
    if exists(select * from information_schema.columns where table_name='admins' and column_name='updatedat') then
        alter table public.admins rename column "updatedat" to updated_at;
    end if;

    -- Grades table
    if exists(select * from information_schema.columns where table_name='grades' and column_name='createdat') then
        alter table public.grades rename column "createdat" to created_at;
    end if;
    if exists(select * from information_schema.columns where table_name='grades' and column_name='updatedat') then
        alter table public.grades rename column "updatedat" to updated_at;
    end if;

    -- Lessons table
    if exists(select * from information_schema.columns where table_name='lessons' and column_name='createdat') then
        alter table public.lessons rename column "createdat" to created_at;
    end if;
    if exists(select * from information_schema.columns where table_name='lessons' and column_name='updatedat') then
        alter table public.lessons rename column "updatedat" to updated_at;
    end if;

    -- Lesson content table
    if exists(select * from information_schema.columns where table_name='lesson_content' and column_name='createdat') then
        alter table public.lesson_content rename column "createdat" to created_at;
    end if;

    -- Timetables table
    if exists(select * from information_schema.columns where table_name='timetables' and column_name='createdat') then
        alter table public.timetables rename column "createdat" to created_at;
    end if;
    if exists(select * from information_schema.columns where table_name='timetables' and column_name='updatedat') then
        alter table public.timetables rename column "updatedat" to updated_at;
    end if;

    -- Assessments table
    if exists(select * from information_schema.columns where table_name='assessments' and column_name='createdat') then
        alter table public.assessments rename column "createdat" to created_at;
    end if;
    if exists(select * from information_schema.columns where table_name='assessments' and column_name='updatedat') then
        alter table public.assessments rename column "updatedat" to updated_at;
    end if;
end $$;

-- Update all triggers to use snake_case naming convention
drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists set_teachers_updated_at on public.teachers;
create trigger set_teachers_updated_at before update on public.teachers
for each row execute function public.set_updated_at();

drop trigger if exists set_students_updated_at on public.students;
create trigger set_students_updated_at before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists set_assessments_updated_at on public.assessments;
create trigger set_assessments_updated_at before update on public.assessments
for each row execute function public.set_updated_at();

drop trigger if exists set_timetables_updated_at on public.timetables;
create trigger set_timetables_updated_at before update on public.timetables
for each row execute function public.set_updated_at();

-- Update learning-related triggers to use snake_case function (columns already exist)
drop trigger if exists set_updated_at on public.learning_sessions;
create trigger set_updated_at before update on public.learning_sessions
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.learning_visualizations;
create trigger set_updated_at before update on public.learning_visualizations
for each row execute function public.set_updated_at();
