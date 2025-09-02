import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ chatId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { chatId } = await params;
        const { data: chat, error } = await supabase
            .from('chats')
            .select('*')
            .eq('id', chatId)
            .eq('userId', session.user.id)
            .maybeSingle();
        if (error) throw error;

        if (!chat) {
            return new NextResponse('Chat not found', { status: 404 });
        }

        return NextResponse.json(chat);
    } catch (error) {
        console.error('Error fetching chat:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: { chatId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { chatId } = params;
        const { messages } = await request.json();

        const { data, error } = await supabase
            .from('chats')
            .update({ messages, updatedAt: new Date().toISOString() })
            .eq('id', chatId)
            .eq('userId', session.user.id)
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
    request: Request,
    { params }: { params: { chatId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'student') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { chatId } = params;
        const { error } = await supabase
            .from('chats')
            .delete()
            .eq('id', chatId)
            .eq('userId', session.user.id);
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