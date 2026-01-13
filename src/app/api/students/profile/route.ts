import { NextResponse } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function GET(req: Request) {
    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Verify user is a student
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (!userData || userData.role !== 'student') {
            return new NextResponse('Unauthorized - Student access required', { status: 403 });
        }

        const { data: student } = await supabase
            .from('students_view')
            .select('name, email, grade')
            .eq('id', user.id)
            .maybeSingle();

        if (!student) {
            return new NextResponse('Student not found', { status: 404 });
        }

        return NextResponse.json({
            name: student?.name,
            email: student?.email,
            gradeLevel: (student as any)?.grade || null
        });
    } catch (error) {
        console.error('Error fetching student profile:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
