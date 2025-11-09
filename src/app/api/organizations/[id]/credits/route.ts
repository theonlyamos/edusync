import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';

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
        { error: 'Access denied. Only owners and admins can allocate credits.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { member_id, credits } = body;

    if (!member_id || credits === undefined || credits < 0) {
      return NextResponse.json(
        { error: 'member_id and credits (non-negative) are required' },
        { status: 400 }
      );
    }

    const { data: organization } = await supabase
      .from('organizations')
      .select('credits')
      .eq('id', id)
      .single();

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('credits_allocated')
      .eq('id', member_id)
      .eq('organization_id', id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    const creditDifference = credits - member.credits_allocated;

    if (creditDifference > organization.credits) {
      return NextResponse.json(
        { error: 'Insufficient organization credits' },
        { status: 400 }
      );
    }

    const { error: memberError } = await supabase
      .from('organization_members')
      .update({ credits_allocated: credits })
      .eq('id', member_id)
      .eq('organization_id', id);

    if (memberError) {
      console.error('Error allocating credits to member:', memberError);
      return NextResponse.json(
        { error: 'Failed to allocate credits' },
        { status: 500 }
      );
    }

    const { error: orgError } = await supabase
      .from('organizations')
      .update({ credits: organization.credits - creditDifference })
      .eq('id', id);

    if (orgError) {
      console.error('Error updating organization credits:', orgError);
      return NextResponse.json(
        { error: 'Failed to update organization credits' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Credits allocated successfully',
      member_credits: credits,
      organization_credits: organization.credits - creditDifference
    });
  } catch (error: any) {
    console.error('Error in POST /api/organizations/[id]/credits:', error);
    return NextResponse.json(
      { error: 'Failed to allocate credits', details: error.message },
      { status: 500 }
    );
  }
}

