import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabase } from '@/lib/supabase';
import { authOptions } from '@/lib/auth';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const lessonId = searchParams.get('lessonId');

        let query = supabase.from('resources').select('*');
        if (lessonId) query = query.eq('lessonId', lessonId);
        if (session.user.role === 'teacher') query = query.eq('createdBy', session.user.id);
        const { data, error } = await query.order('createdAt', { ascending: false });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error('Error fetching resources:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const data = await req.json();
        const { lessonId, title, description, type, fileUrl, filename, url, originalUrl } = data as any;

        const resource = {
            lessonId,
            title,
            description,
            type,
            fileUrl,
            filename,
            url,
            originalUrl,
            createdBy: session.user.id,
            createdAt: new Date().toISOString()
        } as any;

        const { data: inserted, error } = await supabase
            .from('resources')
            .insert(resource)
            .select('*')
            .single();
        if (error) throw error;
        return NextResponse.json(inserted);
    } catch (error) {
        console.error('Error creating resource:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 