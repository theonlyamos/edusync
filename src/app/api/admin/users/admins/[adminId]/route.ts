import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import { requirePlatformAdmin } from '@/lib/platform-admin.server';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ adminId: string }> }
) {
    try {
        const { adminId } = await params;
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = createServerSupabase();
        const { data: admin, error } = await supabase
            .from('users')
            .select('id, email, name, image, isActive, lastLogin, createdAt, updatedAt')
            .eq('id', adminId)
            .eq('role', 'admin')
            .maybeSingle();
        if (error) throw error;

        if (!admin) {
            return new NextResponse('Admin not found', { status: 404 });
        }

        return NextResponse.json(admin);
    } catch (error) {
        console.error('Error fetching admin:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ adminId: string }> }
) {
    try {
        const { adminId } = await params;
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const updates = await req.json();
        const allowedUpdates = ['name', 'email', 'status', 'isActive'];
        const updateData: { [key: string]: any } = {};

        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                if (key === 'status') {
                    updateData['isActive'] = updates[key] === 'active';
                } else {
                    updateData[key] = updates[key];
                }
            }
        });

        if (Object.keys(updateData).length === 0) {
            return new NextResponse('No valid updates provided', { status: 400 });
        }

        updateData.updatedAt = new Date().toISOString();

        const supabase = createServerSupabase();

        // Check if email is already taken by another user
        if (updateData.email) {
            const { data: other } = await supabase
                .from('users')
                .select('id')
                .eq('email', updateData.email)
                .neq('id', adminId)
                .maybeSingle();
            if (other) return new NextResponse('Email already in use', { status: 400 });
        }

        const { data: result, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', adminId)
            .eq('role', 'admin')
            .select('id, email, name, image, isActive, lastLogin, createdAt, updatedAt')
            .maybeSingle();
        if (error) throw error;

        if (!result) {
            return new NextResponse('Admin not found', { status: 404 });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error updating admin:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

/**
 * Removes platform admin rights. The account itself stays, as a normal
 * account, so nothing the person made is lost.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ adminId: string }> }
) {
    const access = await requirePlatformAdmin();
    if (!access.ok) return access.response;
    const { supabase, adminId: currentAdminId } = access.context;
    const { adminId } = await params;

    if (currentAdminId === adminId) {
        return NextResponse.json({ error: 'You cannot remove your own admin rights.' }, { status: 400 });
    }

    try {
        const { count, error: countError } = await supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('role', 'admin');
        if (countError) throw countError;
        if ((count ?? 0) <= 1) {
            return NextResponse.json({ error: 'There must be at least one platform admin.' }, { status: 409 });
        }

        const { data: result, error } = await supabase
            .from('users')
            .update({ role: 'learner' })
            .eq('id', adminId)
            .eq('role', 'admin')
            .select('id')
            .maybeSingle();
        if (error) throw error;
        if (!result) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

        // Database policies treat anyone with an admins row as a platform
        // admin, so the row has to go too.
        const { error: adminRowError } = await supabase.from('admins').delete().eq('user_id', adminId);
        if (adminRowError) {
            await supabase.from('users').update({ role: 'admin' }).eq('id', adminId);
            throw adminRowError;
        }

        return NextResponse.json({ removed: true });
    } catch (error) {
        console.error('Error removing admin:', error);
        return NextResponse.json({ error: 'Failed to remove admin' }, { status: 500 });
    }
}
