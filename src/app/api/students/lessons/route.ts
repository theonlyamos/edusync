import { NextResponse } from 'next/server';
import { createServerSupabase, createSSRUserSupabase } from '@/lib/supabase.server';
import { normalizePublishedObjectives } from '@/lib/lesson-artifacts/student-learning';
import { inClassAudience } from '@/lib/school-classes';
import { studentClassId } from '@/lib/school-classes.server';

export async function GET(request: Request) {
    // The study companion passes ?withContent=1 to give the voice tutor lesson context.
    const withContent = new URL(request.url).searchParams.get("withContent") === "1";
    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // Verify user is a student
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (!userData || userData.role !== 'student') {
            return NextResponse.json({ message: 'Unauthorized - Student access required' }, { status: 403 });
        }

        const { data: student } = await supabase
            .from('students')
            .select('grade')
            .eq('user_id', user.id)
            .maybeSingle();

        if (!student || !student.grade) {
            return NextResponse.json({ message: 'Student record or grade not found' }, { status: 404 });
        }

        // Lessons for the student's grade (same case-insensitive match as the
        // lesson page). Only the columns the list shows: never the full content.
        const { data: lessons, error } = await supabase
            .from('lessons')
            .select('id,title,subject,subject_id,gradelevel,created_at,current_publication_id,audience_class_ids')
            .ilike('gradelevel', student.grade.trim())
            // Students only see lessons their teacher has published and not archived.
            .not('current_publication_id', 'is', null)
            .is('archived_at', null)
            .order('created_at', { ascending: false });
        if (error) throw error;
        // Lessons set for particular classes only show to students in them.
        const classId = (lessons ?? []).some((lesson) => lesson.audience_class_ids?.length)
            ? await studentClassId(createServerSupabase(), user.id)
            : null;
        const visibleLessons = (lessons ?? []).filter((lesson) => inClassAudience(lesson.audience_class_ids, classId));

        // Show what students will see when they open the lesson: the published
        // snapshot's title and objectives, not unpublished edits.
        const publicationIds = visibleLessons.map((lesson) => lesson.current_publication_id as string);
        const { data: publications, error: publicationError } = publicationIds.length
            ? await createServerSupabase()
                .from('lesson_publications')
                .select('id,lesson:manifest->lesson,objectives:manifest->objectives')
                .in('id', publicationIds)
            : { data: [], error: null };
        if (publicationError) throw publicationError;
        const byId = new Map((publications ?? []).map((p: any) => [p.id as string, p]));

        // Lessons linked to the school's subject list show the listed name,
        // so "Maths" and "Mathematics" filter together.
        const subjectIds = [...new Set(visibleLessons.map((lesson) => lesson.subject_id).filter(Boolean))] as string[];
        const { data: subjectRows } = subjectIds.length
            ? await createServerSupabase().from('school_subjects').select('id,name').in('id', subjectIds)
            : { data: [] };
        const subjectName = new Map((subjectRows ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));

        return NextResponse.json(visibleLessons.map((lesson) => {
            const published = byId.get(lesson.current_publication_id as string);
            const objectives = normalizePublishedObjectives(published?.objectives ?? []) ?? [];
            return {
                id: lesson.id,
                title: published?.lesson?.title ?? lesson.title,
                subject: (lesson.subject_id && subjectName.get(lesson.subject_id)) || published?.lesson?.subject || lesson.subject,
                gradelevel: lesson.gradelevel,
                created_at: lesson.created_at,
                objectives: objectives.map((objective) => objective.text).filter(Boolean),
                ...(withContent ? { content: published?.lesson?.content ?? null } : {}),
            };
        }));
    } catch (error) {
        console.error('Error fetching lessons:', error);
        return NextResponse.json(
            { message: 'An error occurred while fetching lessons' },
            { status: 500 }
        );
    }
}
