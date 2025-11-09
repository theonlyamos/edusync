import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createSSRUserSupabase();

    // Get all organization memberships for the user
    const { data: memberships, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    if (memberError) {
      console.error('Error fetching memberships:', memberError);
      return NextResponse.json(
        { error: 'Failed to fetch organizations' },
        { status: 500 }
      );
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ organizations: [] });
    }

    // Get all organizations where user is a member
    const orgIds = memberships.map(m => m.organization_id);
    
    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('*')
      .in('id', orgIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching organizations:', error);
      return NextResponse.json(
        { error: 'Failed to fetch organizations' },
        { status: 500 }
      );
    }

    // Add role information to each organization
    const orgsWithRoles = organizations?.map(org => {
      const membership = memberships.find(m => m.organization_id === org.id);
      return {
        ...org,
        user_role: membership?.role || 'member'
      };
    }) || [];

    return NextResponse.json({ organizations: orgsWithRoles });
  } catch (error: any) {
    console.error('Error in GET /api/organizations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch organizations', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Organization name is required' },
        { status: 400 }
      );
    }

    const supabase = await createSSRUserSupabase();

    const { data: organization, error } = await supabase
      .from('organizations')
      .insert([
        {
          name: name.trim(),
          description: description?.trim() || null,
          owner_id: session.user.id,
          credits: 0,
          total_credits_purchased: 0,
          total_credits_used: 0,
          is_active: true,
          settings: {}
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating organization:', error);
      return NextResponse.json(
        { error: 'Failed to create organization' },
        { status: 500 }
      );
    }

    return NextResponse.json({ organization }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/organizations:', error);
    return NextResponse.json(
      { error: 'Failed to create organization', details: error.message },
      { status: 500 }
    );
  }
}

