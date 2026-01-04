-- Update teachers_view to include teacher record ID (for foreign key references)
-- Must drop and recreate because we're adding a new column

DROP VIEW IF EXISTS public.teachers_view;

CREATE VIEW public.teachers_view AS
SELECT 
    t.id AS teacher_id,
    u.id,
    u.email,
    u.name,
    t.subjects,
    t.grades,
    t.qualifications,
    t.specializations,
    u.isactive,
    u.created_at AS createdat,
    u.updated_at AS updatedat
FROM users u
JOIN teachers t ON t.user_id = u.id
WHERE u.role = 'teacher'::text;
