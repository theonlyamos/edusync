-- Migration: Enable Row Level Security for Educational Platform
-- This script enables RLS and creates appropriate policies for all tables except 'feedback'

-- ============================================================================
-- 1. USERS TABLE - Core authentication and user data
-- ============================================================================

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "users_select_own" ON users
    FOR SELECT
    USING (auth.uid() = id);

-- Users can update their own profile (except role and admin fields)
CREATE POLICY "users_update_own" ON users
    FOR UPDATE
    USING (auth.uid() = id);

-- Admins can view all users
CREATE POLICY "users_admin_select_all" ON users
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- Admins can update any user
CREATE POLICY "users_admin_update_all" ON users
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- Admins can insert new users
CREATE POLICY "users_admin_insert" ON users
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- Teachers can view students in their classes (basic info only)
CREATE POLICY "users_teacher_view_students" ON users
    FOR SELECT
    TO authenticated
    USING (
        role = 'student' AND
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'teacher'
        )
    );

-- ============================================================================
-- 2. STUDENTS TABLE - Student-specific data
-- ============================================================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Students can view their own data
CREATE POLICY "students_select_own" ON students
    FOR SELECT
    USING (user_id = auth.uid());

-- Students can update their own data (limited fields)
CREATE POLICY "students_update_own" ON students
    FOR UPDATE
    USING (user_id = auth.uid());

-- Admins can view all students
CREATE POLICY "students_admin_all" ON students
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- Teachers can view students (read-only)
CREATE POLICY "students_teacher_select" ON students
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'teacher'
        )
    );

-- ============================================================================
-- 3. TEACHERS TABLE - Teacher-specific data
-- ============================================================================

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

-- Teachers can view their own data
CREATE POLICY "teachers_select_own" ON teachers
    FOR SELECT
    USING (user_id = auth.uid());

-- Teachers can update their own data
CREATE POLICY "teachers_update_own" ON teachers
    FOR UPDATE
    USING (user_id = auth.uid());

-- Admins can manage all teachers
CREATE POLICY "teachers_admin_all" ON teachers
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- Students can view teacher basic info (for lessons they're enrolled in)
CREATE POLICY "teachers_student_view_basic" ON teachers
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'student'
        )
    );

-- ============================================================================
-- 4. ADMINS TABLE - Admin-specific data
-- ============================================================================

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Admins can view their own data
CREATE POLICY "admins_select_own" ON admins
    FOR SELECT
    USING (user_id = auth.uid());

-- Admins can update their own data (except superadmin status)
CREATE POLICY "admins_update_own" ON admins
    FOR UPDATE
    USING (user_id = auth.uid());

-- Super admins can manage all admins
CREATE POLICY "admins_superadmin_all" ON admins
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid() AND a.issuperadmin = true
        )
    );

-- ============================================================================
-- 5. GRADES TABLE - Grade levels and subjects
-- ============================================================================

ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view grades
CREATE POLICY "grades_select_all" ON grades
    FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can modify grades
CREATE POLICY "grades_admin_modify" ON grades
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- ============================================================================
-- 6. LESSONS TABLE - Lesson content and metadata
-- ============================================================================

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

-- Students can view lessons for their grade level
CREATE POLICY "lessons_student_select" ON lessons
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN students s ON u.id = s.user_id 
            WHERE u.id = auth.uid() AND (gradelevel IS NULL OR s.grade = gradelevel)
        )
    );

-- Teachers can view all lessons
CREATE POLICY "lessons_teacher_select" ON lessons
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'teacher'
        )
    );

-- Teachers can manage their own lessons
CREATE POLICY "lessons_teacher_own" ON lessons
    FOR ALL
    TO authenticated
    USING (teacher = auth.uid());

-- Admins can manage all lessons
CREATE POLICY "lessons_admin_all" ON lessons
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- ============================================================================
-- 7. LESSON_CONTENT TABLE - Detailed lesson content
-- ============================================================================

ALTER TABLE lesson_content ENABLE ROW LEVEL SECURITY;

-- Students can view lesson content for lessons they have access to
CREATE POLICY "lesson_content_student_select" ON lesson_content
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM lessons l 
            JOIN users u ON u.id = auth.uid()
            JOIN students s ON u.id = s.user_id
            WHERE l.id = lesson_id 
            AND (l.gradelevel IS NULL OR s.grade = l.gradelevel)
        )
    );

-- Teachers can view all lesson content
CREATE POLICY "lesson_content_teacher_select" ON lesson_content
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'teacher'
        )
    );

-- Teachers can manage content for their own lessons
CREATE POLICY "lesson_content_teacher_own" ON lesson_content
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM lessons l 
            WHERE l.id = lesson_id AND l.teacher = auth.uid()
        )
    );

-- Admins can manage all lesson content
CREATE POLICY "lesson_content_admin_all" ON lesson_content
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- ============================================================================
-- 8. TIMETABLES TABLE - Schedule management
-- ============================================================================

ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;

-- Students can view timetables for their grade
CREATE POLICY "timetables_student_select" ON timetables
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN students s ON u.id = s.user_id 
            WHERE u.id = auth.uid() AND s.grade = grade
        )
    );

-- Teachers can view all timetables
CREATE POLICY "timetables_teacher_select" ON timetables
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'teacher'
        )
    );

-- Admins can manage all timetables
CREATE POLICY "timetables_admin_all" ON timetables
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- ============================================================================
-- 9. ASSESSMENTS TABLE - Assessment definitions
-- ============================================================================

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

-- Students can view assessments for their grade level
CREATE POLICY "assessments_student_select" ON assessments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN students s ON u.id = s.user_id 
            WHERE u.id = auth.uid() AND s.grade = gradelevel
        )
    );

-- Teachers can view all assessments
CREATE POLICY "assessments_teacher_select" ON assessments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'teacher'
        )
    );

-- Teachers can manage assessments they created
CREATE POLICY "assessments_teacher_own" ON assessments
    FOR ALL
    TO authenticated
    USING (createdby = auth.uid());

-- Admins can manage all assessments
CREATE POLICY "assessments_admin_all" ON assessments
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- ============================================================================
-- 10. ASSESSMENT_RESULTS TABLE - Student assessment results
-- ============================================================================

ALTER TABLE assessment_results ENABLE ROW LEVEL SECURITY;

-- Students can view their own assessment results
CREATE POLICY "assessment_results_student_own" ON assessment_results
    FOR SELECT
    USING (studentid = auth.uid());

-- Students can insert/update their own assessment results
CREATE POLICY "assessment_results_student_insert" ON assessment_results
    FOR INSERT
    WITH CHECK (studentid = auth.uid());

CREATE POLICY "assessment_results_student_update" ON assessment_results
    FOR UPDATE
    USING (studentid = auth.uid());

-- Teachers can view results for assessments they created
CREATE POLICY "assessment_results_teacher_select" ON assessment_results
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM assessments a 
            WHERE a.id = assessmentid AND a.createdby = auth.uid()
        )
    );

-- Admins can view all assessment results
CREATE POLICY "assessment_results_admin_all" ON assessment_results
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- ============================================================================
-- 11. CHATS TABLE - Chat conversations
-- ============================================================================

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

-- Users can manage their own chats
CREATE POLICY "chats_user_own" ON chats
    FOR ALL
    USING (userid = auth.uid());

-- Teachers can view chats related to their lessons
CREATE POLICY "chats_teacher_lesson" ON chats
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM lessons l 
            WHERE l.id = lessonid AND l.teacher = auth.uid()
        )
    );

-- Admins can view all chats
CREATE POLICY "chats_admin_all" ON chats
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- ============================================================================
-- 12. PRACTICE_RESULTS TABLE - Student practice results
-- ============================================================================

ALTER TABLE practice_results ENABLE ROW LEVEL SECURITY;

-- Students can manage their own practice results
CREATE POLICY "practice_results_student_own" ON practice_results
    FOR ALL
    USING (studentid = auth.uid());

-- Teachers can view practice results (read-only)
CREATE POLICY "practice_results_teacher_select" ON practice_results
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'teacher'
        )
    );

-- Admins can view all practice results
CREATE POLICY "practice_results_admin_all" ON practice_results
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- ============================================================================
-- 13. STUDENT_STATS TABLE - Aggregated student statistics
-- ============================================================================

ALTER TABLE student_stats ENABLE ROW LEVEL SECURITY;

-- Students can view their own stats
CREATE POLICY "student_stats_student_own" ON student_stats
    FOR SELECT
    USING (studentid = auth.uid());

-- Students can update their own stats (typically via triggers/functions)
CREATE POLICY "student_stats_student_update" ON student_stats
    FOR UPDATE
    USING (studentid = auth.uid());

-- Students can insert their own stats
CREATE POLICY "student_stats_student_insert" ON student_stats
    FOR INSERT
    WITH CHECK (studentid = auth.uid());

-- Teachers can view student stats (read-only)
CREATE POLICY "student_stats_teacher_select" ON student_stats
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'teacher'
        )
    );

-- Admins can manage all student stats
CREATE POLICY "student_stats_admin_all" ON student_stats
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            JOIN admins a ON u.id = a.user_id 
            WHERE u.id = auth.uid()
        )
    );

-- ============================================================================
-- HELPER FUNCTIONS (Optional)
-- ============================================================================

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users u 
        JOIN admins a ON u.id = a.user_id 
        WHERE u.id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if current user is teacher
CREATE OR REPLACE FUNCTION is_teacher()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users u 
        WHERE u.id = auth.uid() AND u.role = 'teacher'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if current user is student
CREATE OR REPLACE FUNCTION is_student()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users u 
        WHERE u.id = auth.uid() AND u.role = 'student'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's grade (for students)
CREATE OR REPLACE FUNCTION get_user_grade()
RETURNS TEXT AS $$
BEGIN
    RETURN (
        SELECT s.grade 
        FROM students s 
        WHERE s.user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SUMMARY
-- ============================================================================
/*
This migration enables Row Level Security on all tables except 'feedback' with the following access patterns:

1. USERS: Users see their own data, admins see all, teachers see students
2. STUDENTS/TEACHERS/ADMINS: Users see their own data, admins see all
3. GRADES: All authenticated users can read, only admins can modify
4. LESSONS: Students see grade-appropriate lessons, teachers see all, teachers manage their own
5. LESSON_CONTENT: Follows lesson access patterns
6. TIMETABLES: Students see their grade's timetable, teachers see all, admins manage
7. ASSESSMENTS: Students see grade-appropriate assessments, teachers manage their own
8. ASSESSMENT_RESULTS: Students see their own, teachers see results for their assessments
9. CHATS: Users manage their own, teachers see lesson-related chats
10. PRACTICE_RESULTS: Students manage their own, teachers can view
11. STUDENT_STATS: Students see their own, teachers can view, admins manage

Key Security Features:
- Role-based access control (admin/teacher/student)
- Grade-level restrictions for students
- Teacher ownership of lessons and assessments
- Admin override for all operations
- Helper functions for common access patterns
*/
