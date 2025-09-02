import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabase } from '@/lib/supabase';
import { authOptions } from '@/lib/auth';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { data: student } = await supabase
            .from('students')
            .select('grade')
            .eq('user_id', session.user.id)
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