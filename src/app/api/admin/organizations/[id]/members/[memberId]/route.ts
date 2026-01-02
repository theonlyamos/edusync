import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; memberId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id, memberId } = await params;
        const supabase = createServerSupabase();
        const body = await request.json();

        const allowedUpdates = ['role', 'credits_allocated', 'is_active'];
        const updateData: Record<string, any> = {};

        Object.keys(body).forEach(key => {
            if (allowedUpdates.includes(key)) {
                updateData[key] = body[key];
            }
        });

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { error: 'No valid updates provided' },
                { status: 400 }
            );
        }

        const { data: member, error } = await supabase
            .from('organization_members')
            .update(updateData)
            .eq('id', memberId)
            .eq('organization_id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating member:', error);
            return NextResponse.json(
                { error: 'Failed to update member' },
                { status: 500 }
            );
        }

        if (!member) {
            return NextResponse.json(
                { error: 'Member not found' },
                { status: 404 }
            );
        }

        // Fetch user details
        const { data: user } = await supabase
            .from('users')
            .select('id, name, email')
            .eq('id', member.user_id)
            .single();

        return NextResponse.json({
            ...member,
            users: user || { id: member.user_id, name: 'Unknown', email: 'N/A' }
        });
    } catch (error: any) {
        console.error('Error in PATCH /api/admin/organizations/[id]/members/[memberId]:', error);
        return NextResponse.json(
            { error: 'Failed to update member', details: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; memberId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id, memberId } = await params;
        const supabase = createServerSupabase();

        // Check if trying to delete the owner
        const { data: memberToDelete } = await supabase
            .from('organization_members')
            .select('role')
            .eq('id', memberId)
            .eq('organization_id', id)
            .single();

        if (memberToDelete?.role === 'owner') {
            return NextResponse.json(
                { error: 'Cannot remove the organization owner' },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from('organization_members')
            .delete()
            .eq('id', memberId)
            .eq('organization_id', id);

        if (error) {
            console.error('Error deleting member:', error);
            return NextResponse.json(
                { error: 'Failed to remove member' },
                { status: 500 }
            );
        }

        return NextResponse.json({ message: 'Member removed successfully' });
    } catch (error: any) {
        console.error('Error in DELETE /api/admin/organizations/[id]/members/[memberId]:', error);
        return NextResponse.json(
            { error: 'Failed to remove member', details: error.message },
            { status: 500 }
        );
    }
}
