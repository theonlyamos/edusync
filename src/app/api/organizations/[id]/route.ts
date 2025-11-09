import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = await createSSRUserSupabase();

    // Fetch organization first
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();

    if (orgError || !organization) {
      console.error('Error fetching organization:', orgError);
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Fetch organization members separately (without user join to avoid RLS recursion)
    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select('id, user_id, role, credits_allocated, credits_used, joined_at, is_active')
      .eq('organization_id', id);

    if (membersError) {
      console.error('Error fetching members:', membersError);
      return NextResponse.json(
        { error: 'Failed to fetch organization members' },
        { status: 500 }
      );
    }

    // Check authorization
    const isAuthorized = members?.some(
      (member: any) => member.user_id === session.user.id && member.is_active
    );

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Fetch user details separately for each member
    const userIds = members?.map(m => m.user_id) || [];
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', userIds);

    if (usersError) {
      console.error('Error fetching users:', usersError);
      // Continue without user details rather than failing
    }

    // Fetch owner's credits
    const { data: ownerData, error: ownerError } = await supabase
      .from('users')
      .select('credits')
      .eq('id', organization.owner_id)
      .single();

    if (ownerError) {
      console.error('Error fetching owner credits:', ownerError);
    }

    // Combine the data
    const membersWithUsers = members?.map(member => ({
      ...member,
      users: users?.find(u => u.id === member.user_id) || { id: member.user_id, name: 'Unknown', email: 'N/A' }
    }));

    const organizationWithMembers = {
      ...organization,
      credits: ownerData?.credits ?? organization.credits,
      organization_members: membersWithUsers
    };

    return NextResponse.json({ organization: organizationWithMembers });
  } catch (error: any) {
    console.error('Error in GET /api/organizations/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to fetch organization', details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = await createSSRUserSupabase();

    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', id)
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json(
        { error: 'Access denied. Only owners and admins can update the organization.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, is_active } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: organization, error } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating organization:', error);
      return NextResponse.json(
        { error: 'Failed to update organization' },
        { status: 500 }
      );
    }

    return NextResponse.json({ organization });
  } catch (error: any) {
    console.error('Error in PATCH /api/organizations/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to update organization', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = await createSSRUserSupabase();

    const { data: organization } = await supabase
      .from('organizations')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!organization || organization.owner_id !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied. Only the owner can delete the organization.' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting organization:', error);
      return NextResponse.json(
        { error: 'Failed to delete organization' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Organization deleted successfully' });
  } catch (error: any) {
    console.error('Error in DELETE /api/organizations/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to delete organization', details: error.message },
      { status: 500 }
    );
  }
}

