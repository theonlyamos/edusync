import { NextResponse, NextRequest } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ resourceId: string }> }
) {
    const { resourceId } = await params;

    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Verify user is a teacher
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (!userData || userData.role !== 'teacher') {
            return new NextResponse('Unauthorized - Teacher access required', { status: 403 });
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
    req: NextRequest,
    { params }: { params: Promise<{ resourceId: string }> }
) {
    const { resourceId } = await params;

    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Verify user is a teacher
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (!userData || userData.role !== 'teacher') {
            return new NextResponse('Unauthorized - Teacher access required', { status: 403 });
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
