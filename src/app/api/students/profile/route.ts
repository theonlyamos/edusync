import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabase } from '@/lib/supabase';
import { authOptions } from '@/lib/auth';
// Removed legacy Mongo models; using Supabase view instead

// Using Supabase 'students_view' shape directly

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { data: student } = await supabase
            .from('students_view')
            .select('name, email, grade')
            .eq('id', session.user.id)
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