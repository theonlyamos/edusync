import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabase } from '@/lib/supabase';
import { authOptions } from '@/lib/auth';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ contentId: string }> }
) {
    const { contentId } = await params;

    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { data: content, error } = await supabase
            .from('lesson_content')
            .select('*')
            .eq('id', contentId)
            .maybeSingle();
        if (error) throw error;

        if (!content) {
            return new NextResponse('Content not found', { status: 404 });
        }

        return NextResponse.json(content);
    } catch (error) {
        console.error('Error fetching content:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ contentId: string }> }
) {
    const { contentId } = await params;

    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { content } = await req.json();
        const { data: result, error } = await supabase
            .from('lesson_content')
            .update({ content })
            .eq('id', contentId)
            .select('*')
            .maybeSingle();
        if (error) throw error;

        if (!result) {
            return new NextResponse('Content not found', { status: 404 });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error updating content:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ contentId: string }> }
) {
    const { contentId } = await params;

    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { error } = await supabase
            .from('lesson_content')
            .delete()
            .eq('id', contentId);
        if (error) throw error;

        // Note: Supabase doesn't return deletedCount directly; assume success if no error
        const { data: check } = await supabase.from('lesson_content').select('id').eq('id', contentId).maybeSingle();
        if (check) {
            return new NextResponse('Content not found', { status: 404 });
        }

        return NextResponse.json({ message: 'Content deleted successfully' });
    } catch (error) {
        console.error('Error deleting content:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 