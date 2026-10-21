import { NextRequest, NextResponse } from 'next/server';
import { organizationMemberRole, SCHOOL_MEMBERS_BY_INVITE_ONLY, type MemberFormRole } from '@/lib/school';

const DEVELOPER_MEMBER_ROLES = ['owner', 'admin', 'learner'];
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id } = await params;
        const supabase = createServerSupabase();

        // Fetch members with user details using inner join
        const { data: members, error } = await supabase
            .from('organization_members')
            .select('*, users!organization_members_user_id_fkey(id, name, email, role)')
            .eq('organization_id', id)
            .order('joined_at', { ascending: false });

        if (error) {
            console.error('Error fetching members:', error);
            return NextResponse.json(
                { error: 'Failed to fetch members' },
                { status: 500 }
            );
        }

        return NextResponse.json(members ?? []);
    } catch (error: any) {
        console.error('Error in GET /api/admin/organizations/[id]/members:', error);
        return NextResponse.json(
            { error: 'Failed to fetch members', details: error.message },
            { status: 500 }
        );
    }
}

/**
 * Adds an existing account to a developer organization. Support never creates
 * accounts or sets passwords here, and schools add people through invites.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id } = await params;
        const supabase = createServerSupabase();
        const body = await request.json().catch(() => ({}));
        const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
        const role = body?.role;
        const credits_allocated = Number(body?.credits_allocated) || 0;

        if (!email || !role) {
            return NextResponse.json({ error: 'Email and role are required' }, { status: 400 });
        }
        if (!DEVELOPER_MEMBER_ROLES.includes(role)) {
            return NextResponse.json(
                { error: `Invalid role. Must be one of: ${DEVELOPER_MEMBER_ROLES.join(', ')}` },
                { status: 400 }
            );
        }

        const { data: organization } = await supabase
            .from('organizations')
            .select('type')
            .eq('id', id)
            .maybeSingle();
        if (!organization) {
            return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        }
        if (organization.type === 'school') {
            return NextResponse.json({ error: SCHOOL_MEMBERS_BY_INVITE_ONLY }, { status: 409 });
        }

        const { data: user } = await supabase
            .from('users')
            .select('id, name, email, role')
            .eq('email', email)
            .maybeSingle();
        if (!user) {
            return NextResponse.json(
                { error: 'No account uses that email. Ask them to sign up first, then add them here.' },
                { status: 404 }
            );
        }

        const { data: existingMember } = await supabase
            .from('organization_members')
            .select('id')
            .eq('organization_id', id)
            .eq('user_id', user.id)
            .maybeSingle();
        if (existingMember) {
            return NextResponse.json({ error: 'User is already a member of this organization' }, { status: 400 });
        }

        const { data: member, error } = await supabase
            .from('organization_members')
            .insert({
                organization_id: id,
                user_id: user.id,
                role: organizationMemberRole(role as MemberFormRole, organization.type),
                credits_allocated,
                credits_used: 0,
                is_active: true,
                invited_by: session.user.id
            })
            .select()
            .single();

        if (error) {
            console.error('Error adding member:', error);
            return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
        }

        return NextResponse.json({ ...member, users: user }, { status: 201 });
    } catch (error: any) {
        console.error('Error in POST /api/admin/organizations/[id]/members:', error);
        return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
    }
}
