import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(req: Request) {
    try {
        const session = await getServerSession();
        if (!session) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const lessonId = searchParams.get('lessonId');
        const type = searchParams.get('type');

        const supabase = createServerSupabase();
        let query = supabase.from('lesson_content').select('*');
        if (lessonId) query = query.eq('lesson_id', lessonId);
        if (type) query = query.eq('type', type);
        const { data, error } = await query.order('created_at', { ascending: false });
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
        if (!session || !['admin', 'teacher'].includes(session.user?.role as string)) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = createServerSupabase();
        const payload = await req.json();
        const { lessonId, type, content } = payload as { lessonId: string; type: string; content: any };

        const insert = {
            lesson_id: lessonId,
            type,
            content,
            created_at: new Date().toISOString()
        };

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