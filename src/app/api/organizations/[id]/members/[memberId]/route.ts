import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, memberId } = await params;
    const supabase = await createSSRUserSupabase();

    const { data: adminCheck } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', id)
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (!adminCheck || !['owner', 'admin'].includes(adminCheck.role)) {
      return NextResponse.json(
        { error: 'Access denied. Only owners and admins can update members.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { role, credits_allocated, is_active } = body;

    const updateData: any = {};
    if (role !== undefined) {
      if (!['admin', 'member'].includes(role)) {
        return NextResponse.json(
          { error: 'Invalid role. Must be admin or member.' },
          { status: 400 }
        );
      }
      updateData.role = role;
    }
    if (credits_allocated !== undefined) updateData.credits_allocated = credits_allocated;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: member, error } = await supabase
      .from('organization_members')
      .update(updateData)
      .eq('id', memberId)
      .eq('organization_id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating member:', error);
      return NextResponse.json(
        { error: 'Failed to update member' },
        { status: 500 }
      );
    }

    // Fetch user details separately
    const { data: user } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', member.user_id)
      .single();

    const memberWithUser = {
      ...member,
      users: user || { id: member.user_id, name: 'Unknown', email: 'N/A' }
    };

    return NextResponse.json({ member: memberWithUser });
  } catch (error: any) {
    console.error('Error in PATCH /api/organizations/[id]/members/[memberId]:', error);
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
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, memberId } = await params;
    const supabase = await createSSRUserSupabase();

    const { data: adminCheck } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', id)
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (!adminCheck || !['owner', 'admin'].includes(adminCheck.role)) {
      return NextResponse.json(
        { error: 'Access denied. Only owners and admins can remove members.' },
        { status: 403 }
      );
    }

    const { data: memberToRemove } = await supabase
      .from('organization_members')
      .select('role, user_id')
      .eq('id', memberId)
      .eq('organization_id', id)
      .single();

    if (memberToRemove?.role === 'owner') {
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
      console.error('Error removing member:', error);
      return NextResponse.json(
        { error: 'Failed to remove member' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Member removed successfully' });
  } catch (error: any) {
    console.error('Error in DELETE /api/organizations/[id]/members/[memberId]:', error);
    return NextResponse.json(
      { error: 'Failed to remove member', details: error.message },
      { status: 500 }
    );
  }
}

