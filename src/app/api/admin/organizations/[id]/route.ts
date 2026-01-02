import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = createServerSupabase();
        const { data: organization, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;

        if (!organization) {
            return new NextResponse('Organization not found', { status: 404 });
        }

        return NextResponse.json(organization);
    } catch (error) {
        console.error('Error fetching organization:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const updates = await req.json();
        const allowedUpdates = ['name', 'description', 'is_active', 'credits', 'settings', 'owner_id'];
        const updateData: { [key: string]: any } = {};

        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                updateData[key] = updates[key];
            }
        });

        if (Object.keys(updateData).length === 0) {
            return new NextResponse('No valid updates provided', { status: 400 });
        }

        updateData.updated_at = new Date().toISOString();

        const supabase = createServerSupabase();

        const { data: result, error } = await supabase
            .from('organizations')
            .update(updateData)
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error) throw error;

        if (!result) {
            return new NextResponse('Organization not found', { status: 404 });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error updating organization:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = createServerSupabase();

        // Soft delete by setting is_active to false, or hard delete
        // Using soft delete for safety
        const { data: result, error } = await supabase
            .from('organizations')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error) throw error;

        if (!result) {
            return new NextResponse('Organization not found', { status: 404 });
        }

        return NextResponse.json({ message: 'Organization deactivated successfully' });
    } catch (error) {
        console.error('Error deleting organization:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
