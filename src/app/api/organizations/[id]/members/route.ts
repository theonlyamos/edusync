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

    // Fetch members without user join to avoid RLS recursion
    const { data: members, error } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', id)
      .order('joined_at', { ascending: false });

    if (error) {
      console.error('Error fetching members:', error);
      return NextResponse.json(
        { error: 'Failed to fetch members' },
        { status: 500 }
      );
    }

    // Fetch user details separately
    const userIds = members?.map(m => m.user_id) || [];
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', userIds);

    // Combine the data
    const membersWithUsers = members?.map(member => ({
      ...member,
      users: users?.find(u => u.id === member.user_id) || { id: member.user_id, name: 'Unknown', email: 'N/A' }
    }));

    return NextResponse.json({ members: membersWithUsers });
  } catch (error: any) {
    console.error('Error in GET /api/organizations/[id]/members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch members', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const { data: adminCheck } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', id)
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (!adminCheck || !['owner', 'admin'].includes(adminCheck.role)) {
      return NextResponse.json(
        { error: 'Access denied. Only owners and admins can add members.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { user_id, role, credits_allocated } = body;

    if (!user_id || !role) {
      return NextResponse.json(
        { error: 'user_id and role are required' },
        { status: 400 }
      );
    }

    if (!['admin', 'member'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be admin or member.' },
        { status: 400 }
      );
    }

    const { data: existingMember } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json(
        { error: 'User is already a member of this organization' },
        { status: 400 }
      );
    }

    const { data: member, error } = await supabase
      .from('organization_members')
      .insert([
        {
          organization_id: id,
          user_id,
          role,
          credits_allocated: credits_allocated || 0,
          credits_used: 0,
          is_active: true,
          invited_by: session.user.id,
          invitation_accepted_at: new Date().toISOString()
        }
      ])
      .select('*')
      .single();

    if (error) {
      console.error('Error adding member:', error);
      return NextResponse.json(
        { error: 'Failed to add member' },
        { status: 500 }
      );
    }

    // Fetch user details separately
    const { data: user } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', user_id)
      .single();

    const memberWithUser = {
      ...member,
      users: user || { id: user_id, name: 'Unknown', email: 'N/A' }
    };

    return NextResponse.json({ member: memberWithUser }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/organizations/[id]/members:', error);
    return NextResponse.json(
      { error: 'Failed to add member', details: error.message },
      { status: 500 }
    );
  }
}

