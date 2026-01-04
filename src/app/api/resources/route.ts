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

        const supabase = createServerSupabase();

        // Check if resources table exists - return empty array if not
        const { data, error } = await supabase
            .from('lesson_content')
            .select('*')
            .eq('lesson_id', lessonId)
            .eq('type', 'resource')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching resources:', error);
            return NextResponse.json([]);
        }
        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error('Error fetching resources:', error);
        return NextResponse.json([]);
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
        if (!session || !['admin', 'teacher'].includes(session.user?.role as string)) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = createServerSupabase();
        const data = await req.json();
        const { lessonId, title, description, type, fileUrl, filename, url, originalUrl } = data as any;

        // Store resources as lesson_content with type='resource'
        const resource = {
            lesson_id: lessonId,
            type: 'resource',
            content: {
                title,
                description,
                resourceType: type,
                fileUrl,
                filename,
                url,
                originalUrl,
            },
            created_at: new Date().toISOString()
        };

        const { data: inserted, error } = await supabase
            .from('lesson_content')
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