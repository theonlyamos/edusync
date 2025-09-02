import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabase } from '@/lib/supabase';
import { authOptions } from '@/lib/auth';

export async function GET(
    req: Request,
    context: { params: { resourceId: string } }
) {
    const { resourceId } = await context.params;

    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { data: resource, error } = await supabase
            .from('resources')
            .select('*')
            .eq('id', resourceId)
            .maybeSingle();
        if (error) throw error;

        if (!resource) {
            return new NextResponse('Resource not found', { status: 404 });
        }

        return NextResponse.json(resource);
    } catch (error) {
        console.error('Error fetching resource:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    context: { params: { resourceId: string } }
) {
    const { resourceId } = await context.params;

    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { error } = await supabase
            .from('resources')
            .delete()
            .eq('id', resourceId);
        if (error) throw error;

        const { data: check } = await supabase
            .from('resources')
            .select('id')
            .eq('id', resourceId)
            .maybeSingle();
        if (check) {
            return new NextResponse('Resource not found', { status: 404 });
        }

        return NextResponse.json({ message: 'Resource deleted successfully' });
    } catch (error) {
        console.error('Error deleting resource:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 