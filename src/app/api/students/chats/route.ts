import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function GET() {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = await createSSRUserSupabase();
        const { data, error } = await supabase
            .from('chats')
            .select('*')
            .eq('userId', session.user.id)
            .order('updatedAt', { ascending: false });
        if (error) throw error;

        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error('Error fetching chats:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = await createSSRUserSupabase();
        const { lessonId, messages, title } = await req.json();

        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('chats')
            .insert({
                userId: session.user.id,
                lessonId: lessonId ?? null,
                messages,
                title,
                createdAt: now,
                updatedAt: now
            })
            .select('id')
            .single();
        if (error) throw error;

        return NextResponse.json({ chatId: data.id });
    } catch (error) {
        console.error('Error creating chat:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 