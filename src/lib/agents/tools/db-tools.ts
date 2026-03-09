/**
 * Database tools for ADK agents.
 *
 * Each tool wraps a Supabase query and is defined as a `FunctionTool` with a
 * Schema so the LLM knows what arguments to provide.
 */

import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase client (server-side, service role)
// ---------------------------------------------------------------------------

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/**
 * Look up a student's learning session history.
 */
export const lookupStudentProgress = new FunctionTool({
    name: 'lookup_student_progress',
    description:
        'Retrieves recent learning sessions and progress data for a given student.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            studentId: {
                type: Type.STRING,
                description: 'UUID of the student',
            },
            limit: {
                type: Type.NUMBER,
                description: 'Max number of sessions to return (default: 10)',
            },
        },
        required: ['studentId'],
    },
    execute: async (input: unknown) => {
        const args = input as { studentId: string; limit?: number };
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('learning_sessions')
            .select('id, topic, status, created_at, duration_minutes')
            .eq('user_id', args.studentId)
            .order('created_at', { ascending: false })
            .limit(args.limit ?? 10);

        if (error) return { error: error.message };
        return { sessions: data };
    },
});

/**
 * Fetch lesson content by ID.
 */
export const lookupLessonContent = new FunctionTool({
    name: 'lookup_lesson_content',
    description:
        'Fetches the full content of a lesson including title, subject, grade level, and body.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            lessonId: {
                type: Type.STRING,
                description: 'UUID of the lesson',
            },
        },
        required: ['lessonId'],
    },
    execute: async (input: unknown) => {
        const args = input as { lessonId: string };
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('lessons')
            .select('*')
            .eq('id', args.lessonId)
            .single();

        if (error) return { error: error.message };
        return { lesson: data };
    },
});

/**
 * Get assessment results for a student.
 */
export const lookupAssessmentResults = new FunctionTool({
    name: 'lookup_assessment_results',
    description:
        'Retrieves recent assessment results and scores for a given student.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            studentId: {
                type: Type.STRING,
                description: 'UUID of the student',
            },
            limit: {
                type: Type.NUMBER,
                description: 'Max number of results to return (default: 5)',
            },
        },
        required: ['studentId'],
    },
    execute: async (input: unknown) => {
        const args = input as { studentId: string; limit?: number };
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('assessment_results')
            .select('id, assessment_id, score, total_points, submitted_at')
            .eq('student_id', args.studentId)
            .order('submitted_at', { ascending: false })
            .limit(args.limit ?? 5);

        if (error) return { error: error.message };
        return { results: data };
    },
});
