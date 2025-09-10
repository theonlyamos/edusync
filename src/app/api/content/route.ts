import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
    try {
        const session = await getServerSession();
        if (!session) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const lessonId = searchParams.get('lessonId');
        const type = searchParams.get('type');

        let query = supabase.from('lesson_content').select('*');
        if (lessonId) query = query.eq('lesson_id', lessonId);
        if (type) query = query.eq('type', type);
        if (session.user.role === 'teacher') query = query.eq('created_by', session.user.id);
        const { data, error } = await query.order('createdAt', { ascending: false });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error('Error fetching content:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const payload = await req.json();
        const { lessonId, type, content } = payload as { lessonId: string; type: string; content: any };
        const insert = { lesson_id: lessonId, type, content, createdAt: new Date().toISOString(), created_by: session.user.id } as any;
        const { data, error } = await supabase
            .from('lesson_content')
            .insert(insert)
            .select('*')
            .single();
        if (error) throw error;
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error creating content:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 