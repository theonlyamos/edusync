import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { buildChatTitle, chatCreateSchema, mapChat, normalizeMessages, type ChatRow } from '@/lib/study-companion';

export async function GET() {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = await createSSRUserSupabase();
        const { data, error } = await supabase
            .from('chats')
            .select('id, title, userid, lessonid, createdat, updatedat')
            .eq('userid', session.user.id)
            .order('updatedat', { ascending: false });
        if (error) throw error;

        return NextResponse.json(((data ?? []) as ChatRow[]).map(mapChat));
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
        const parsedBody = chatCreateSchema.safeParse(await req.json());
        if (!parsedBody.success) {
            return NextResponse.json(
                { message: 'Invalid chat create request', issues: parsedBody.error.flatten() },
                { status: 400 }
            );
        }

        const { lessonId, title } = parsedBody.data;
        const messages = normalizeMessages(parsedBody.data.messages);

        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('chats')
            .insert({
                userid: session.user.id,
                lessonid: lessonId ?? null,
                messages,
                title: title ?? buildChatTitle(messages[0]?.content),
                createdat: now,
                updatedat: now
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