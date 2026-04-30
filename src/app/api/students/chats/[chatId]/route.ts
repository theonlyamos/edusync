import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { chatUpdateSchema, mapChat, normalizeMessages, type ChatRow } from '@/lib/study-companion';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ chatId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = await createSSRUserSupabase();
        const { chatId } = await params;
        const { data: chat, error } = await supabase
            .from('chats')
            .select('id, userid, lessonid, title, messages, createdat, updatedat')
            .eq('id', chatId)
            .eq('userid', session.user.id)
            .maybeSingle();
        if (error) throw error;

        if (!chat) {
            return new NextResponse('Chat not found', { status: 404 });
        }

        return NextResponse.json(mapChat(chat as ChatRow));
    } catch (error) {
        console.error('Error fetching chat:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ chatId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = await createSSRUserSupabase();
        const { chatId } = await params;
        const parsedBody = chatUpdateSchema.safeParse(await request.json());
        if (!parsedBody.success) {
            return NextResponse.json(
                { message: 'Invalid chat update request', issues: parsedBody.error.flatten() },
                { status: 400 }
            );
        }

        const updatePayload: Record<string, unknown> = {
            updatedat: new Date().toISOString(),
        };

        if (parsedBody.data.messages) {
            updatePayload.messages = normalizeMessages(parsedBody.data.messages);
        }

        if (parsedBody.data.title) {
            updatePayload.title = parsedBody.data.title;
        }

        const { data, error } = await supabase
            .from('chats')
            .update(updatePayload)
            .eq('id', chatId)
            .eq('userid', session.user.id)
            .select('id')
            .maybeSingle();
        if (error) throw error;

        if (!data) {
            return new NextResponse('Chat not found', { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating chat:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ chatId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = await createSSRUserSupabase();
        const { chatId } = await params;
        const { error } = await supabase
            .from('chats')
            .delete()
            .eq('id', chatId)
            .eq('userid', session.user.id);
        if (error) throw error;

        const { data: check } = await supabase
            .from('chats')
            .select('id')
            .eq('id', chatId)
            .maybeSingle();
        if (check) {
            return new NextResponse('Chat not found', { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting chat:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 