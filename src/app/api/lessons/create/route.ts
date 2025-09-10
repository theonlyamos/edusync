import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { title, subject, gradeLevel, objectives, content } = await req.json();

        const now = new Date().toISOString();
        const { error } = await supabase
            .from('lessons')
            .insert({
                title,
                subject,
                gradeLevel,
                objectives,
                content,
                teacher: session.user.id,
                teacherName: session.user.name,
                createdAt: now,
                updatedAt: now
            });
        if (error) throw error;

        return NextResponse.json({ message: 'Lesson created successfully' });
    } catch (error) {
        console.error('Error creating lesson:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 