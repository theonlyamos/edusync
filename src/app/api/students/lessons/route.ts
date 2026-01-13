import { NextResponse } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function GET() {
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

        // Fetch lessons matching the student's grade
        const { data: lessons, error } = await supabase
            .from('lessons')
            .select('*')
            .eq('gradeLevel', student.grade)
            .order('createdAt', { ascending: false });
        if (error) throw error;
        return NextResponse.json(lessons ?? []);
    } catch (error) {
        console.error('Error fetching lessons:', error);
        return NextResponse.json(
            { message: 'An error occurred while fetching lessons' },
            { status: 500 }
        );
    }
}
