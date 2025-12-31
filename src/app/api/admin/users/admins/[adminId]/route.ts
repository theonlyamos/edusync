import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

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

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ adminId: string }> }
) {
    try {
        const { adminId } = await params;
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Prevent admin from deleting themselves
        if (session.user.id === adminId) {
            return new NextResponse('Cannot delete your own admin account', { status: 400 });
        }

        const supabase = createServerSupabase();

        // Delete from Auth users first (requires service role, which createServerSupabase provides)
        const { error: authError } = await supabase.auth.admin.deleteUser(adminId);

        if (authError) {
            console.error('Error deleting auth user:', authError);
            // If user not found in auth (already deleted?), proceed to check public.users
            // But if other error, throw it.
            if (!authError.message.includes('User not found')) {
                throw authError;
            }
        }

        // Also ensure deleted from public users if cascade didn't catch it or for safety
        const { error: publicError } = await supabase
            .from('users')
            .delete()
            .eq('id', adminId)
            .eq('role', 'admin');

        if (publicError) throw publicError;

        return NextResponse.json(null, { status: 200 });
    } catch (error) {
        console.error('Error deleting admin:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}