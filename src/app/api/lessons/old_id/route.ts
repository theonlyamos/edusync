import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ lessonId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { lessonId } = await params;
        const { data: lesson, error } = await supabase
            .from('lessons')
            .select('*')
            .eq('id', lessonId)
            .maybeSingle();
        if (error) throw error;

        if (!lesson) {
            return new NextResponse('Lesson not found', { status: 404 });
        }

        return NextResponse.json(lesson);
    } catch (error) {
        console.error('Error fetching lesson:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ lessonId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const updates = await req.json();
        const { lessonId } = await params;
        const { error } = await supabase
            .from('lessons')
            .update(updates)
            .eq('id', lessonId);
        if (error) throw error;

        const { data: check } = await supabase.from('lessons').select('id').eq('id', lessonId).maybeSingle();
        if (!check) {
            return new NextResponse('Lesson not found', { status: 404 });
        }

        return NextResponse.json({ message: 'Lesson updated successfully' });
    } catch (error) {
        console.error('Error updating lesson:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ lessonId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { lessonId } = await params;
        const { error } = await supabase
            .from('lessons')
            .delete()
            .eq('id', lessonId);
        if (error) throw error;

        const { data: stillThere } = await supabase.from('lessons').select('id').eq('id', lessonId).maybeSingle();
        if (stillThere) {
            return new NextResponse('Lesson not found', { status: 404 });
        }

        await supabase
            .from('lesson_content')
            .delete()
            .eq('lessonId', lessonId);

        return NextResponse.json({ message: 'Lesson and associated content deleted successfully' });
    } catch (error) {
        console.error('Error deleting lesson:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 