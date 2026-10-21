import { NextRequest, NextResponse } from 'next/server';
import { newAccountUserRole, organizationMemberRole, type MemberFormRole } from '@/lib/school';
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
        const body = await request.json();
        const { email, role, credits_allocated } = body;

        if (!email || !role) {
            return NextResponse.json(
                { error: 'Email and role are required' },
                { status: 400 }
            );
        }

        // Valid roles from frontend: owner, admin, teacher, student, learner
        const validRoles = ['owner', 'admin', 'teacher', 'student', 'learner'];
        if (!validRoles.includes(role)) {
            return NextResponse.json(
                { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
                { status: 400 }
            );
        }

        const formRole = role as MemberFormRole;
        const { data: organization } = await supabase
            .from('organizations')
            .select('type')
            .eq('id', id)
            .maybeSingle();
        if (!organization) {
            return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        }
        const isSchool = organization.type === 'school';
        const orgMemberRole = organizationMemberRole(formRole, organization.type);

        const normalizedEmail = email.toLowerCase().trim();

        // 1. Find the account, or create one. Organization owners and admins
        //    get a normal account, never platform admin rights.
        let { data: user } = await supabase
            .from('users')
            .select('id, name, email, role')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (!user) {
            const userRole = newAccountUserRole(formRole);
            const userPassword = body.password || (Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8));
            const { data: authData, error: authCreateError } = await supabase.auth.admin.createUser({
                email: normalizedEmail,
                password: userPassword,
                email_confirm: true,
                user_metadata: {
                    name: body.name,
                    role: userRole,
                },
            });

            if (authCreateError) {
                console.error('Error creating auth user:', authCreateError);
                return NextResponse.json({ error: `Failed to create auth user: ${authCreateError.message}` }, { status: 500 });
            }

            if (!authData.user) {
                return NextResponse.json({ error: 'Failed to create auth user: No user returned' }, { status: 500 });
            }

            const newUserId = authData.user.id;
            const userName = body.name || normalizedEmail.split('@')[0];

            const { error: insertUserError } = await supabase
                .from('users')
                .insert({
                    id: newUserId,
                    email: normalizedEmail,
                    name: userName,
                    role: userRole,
                    isactive: true,
                });

            if (insertUserError) {
                await supabase.auth.admin.deleteUser(newUserId);
                console.error('Error creating public user:', insertUserError);
                return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 });
            }

            user = { id: newUserId, email: normalizedEmail, name: userName, role: userRole };
        }

        const userId = user.id;

        // 2. Membership first, so the school is known before any profile row.
        const { data: existingMember } = await supabase
            .from('organization_members')
            .select('id')
            .eq('organization_id', id)
            .eq('user_id', userId)
            .maybeSingle();

        if (existingMember) {
            return NextResponse.json(
                { error: 'User is already a member of this organization' },
                { status: 400 }
            );
        }

        const { data: member, error } = await supabase
            .from('organization_members')
            .insert({
                organization_id: id,
                user_id: userId,
                role: orgMemberRole,
                credits_allocated: credits_allocated || 0,
                credits_used: 0,
                is_active: true,
                invited_by: session.user.id
            })
            .select()
            .single();

        if (error) {
            console.error('Error adding member:', error);
            const otherSchool = error.message?.includes('another school');
            return NextResponse.json(
                { error: otherSchool ? 'This person already belongs to another school' : 'Failed to add member' },
                { status: otherSchool ? 409 : 500 }
            );
        }

        // 3. School teachers and students also need their profile row in this school.
        if (isSchool && orgMemberRole === 'student') {
            const { data: student } = await supabase
                .from('students')
                .select('id')
                .eq('user_id', userId)
                .maybeSingle();

            if (!student) {
                const { error: createStudentError } = await supabase
                    .from('students')
                    .insert({ user_id: userId, grade: 'N/A', organization_id: id });
                if (createStudentError) console.error('Error creating student record:', createStudentError);
            }
        } else if (isSchool && orgMemberRole === 'teacher') {
            const { data: teacher } = await supabase
                .from('teachers')
                .select('id')
                .eq('user_id', userId)
                .maybeSingle();

            if (!teacher) {
                const { error: createTeacherError } = await supabase
                    .from('teachers')
                    .insert({ user_id: userId, subjects: [], grades: [], organization_id: id });
                if (createTeacherError) console.error('Error creating teacher record:', createTeacherError);
            }
        }

        return NextResponse.json({
            ...member,
            users: user
        }, { status: 201 });

    } catch (error: any) {
        console.error('Error in POST /api/admin/organizations/[id]/members:', error);
        return NextResponse.json(
            { error: 'Failed to add member', details: error.message },
            { status: 500 }
        );
    }
}
