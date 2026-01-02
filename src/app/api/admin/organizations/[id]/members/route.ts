import { NextRequest, NextResponse } from 'next/server';
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

        // Role mapping:
        // - users table: admin, teacher, student (learner maps to student, owner maps to admin)
        // - organization_members table: owner or member (anything not owner becomes member)
        const userRole = role === 'owner' ? 'admin' : role;
        const orgMemberRole = role === 'owner' ? 'owner' : 'member';

        const normalizedEmail = email.toLowerCase().trim();

        // 1. Check if user exists in public.users
        let { data: user } = await supabase
            .from('users')
            .select('id, name, email, role')
            .eq('email', normalizedEmail)
            .maybeSingle();

        // 2. If user does not exist, create Supabase Auth user AND public user
        if (!user) {
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

            const userId = authData.user.id;
            const userName = body.name || normalizedEmail.split('@')[0];

            // Insert into public.users with mapped role
            const { error: insertUserError } = await supabase
                .from('users')
                .insert({
                    id: userId,
                    email: normalizedEmail,
                    name: userName,
                    role: userRole, // admin, teacher, or student
                    isactive: true,
                });

            if (insertUserError) {
                await supabase.auth.admin.deleteUser(userId);
                console.error('Error creating public user:', insertUserError);
                return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 });
            }

            user = { id: userId, email: normalizedEmail, name: userName, role: userRole };
        }

        // 3. Ensure role-specific record exists (Teacher/Student/Admin tables)
        const userId = user.id;

        if (userRole === 'student') {
            const { data: student } = await supabase
                .from('students')
                .select('id')
                .eq('user_id', userId)
                .maybeSingle();

            if (!student) {
                const { error: createStudentError } = await supabase
                    .from('students')
                    .insert({ user_id: userId, grade: 'N/A' });
                if (createStudentError) console.error('Error creating student record:', createStudentError);
            }
        } else if (userRole === 'teacher') {
            const { data: teacher } = await supabase
                .from('teachers')
                .select('id')
                .eq('user_id', userId)
                .maybeSingle();

            if (!teacher) {
                const { error: createTeacherError } = await supabase
                    .from('teachers')
                    .insert({ user_id: userId, subjects: [], grades: [] });
                if (createTeacherError) console.error('Error creating teacher record:', createTeacherError);
            }
        } else if (userRole === 'admin') {
            const { data: admin } = await supabase
                .from('admins')
                .select('id')
                .eq('user_id', userId)
                .maybeSingle();

            if (!admin) {
                const { error: createAdminError } = await supabase
                    .from('admins')
                    .insert({ user_id: userId, permissions: [] });
                if (createAdminError) console.error('Error creating admin record:', createAdminError);
            }
        }

        // 4. Check if already a member
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

        // 5. Add to organization_members with mapped role (owner or member)
        const { data: member, error } = await supabase
            .from('organization_members')
            .insert({
                organization_id: id,
                user_id: userId,
                role: orgMemberRole, // 'owner' or 'member'
                credits_allocated: credits_allocated || 0,
                credits_used: 0,
                is_active: true,
                invited_by: session.user.id
            })
            .select()
            .single();

        if (error) {
            console.error('Error adding member:', error);
            return NextResponse.json(
                { error: 'Failed to add member' },
                { status: 500 }
            );
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
