import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

// GET organization settings
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

        const { data: org, error } = await supabase
            .from('organizations')
            .select('id, settings, is_active, credits, total_credits_purchased, total_credits_used')
            .eq('id', id)
            .single();

        if (error || !org) {
            return NextResponse.json(
                { error: 'Organization not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(org);
    } catch (error: any) {
        console.error('Error in GET /api/admin/organizations/[id]/settings:', error);
        return NextResponse.json(
            { error: 'Failed to fetch organization settings', details: error.message },
            { status: 500 }
        );
    }
}

// PATCH update organization settings
export async function PATCH(
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

        const { settings, is_active, credits } = body;

        const updateData: any = { updated_at: new Date().toISOString() };
        if (settings !== undefined) updateData.settings = settings;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (credits !== undefined) {
            updateData.credits = credits;
            // Track purchased credits if adding
            if (credits > 0) {
                const { data: currentOrg } = await supabase
                    .from('organizations')
                    .select('credits, total_credits_purchased')
                    .eq('id', id)
                    .single();

                if (currentOrg && credits > currentOrg.credits) {
                    const addedCredits = credits - currentOrg.credits;
                    updateData.total_credits_purchased = (currentOrg.total_credits_purchased || 0) + addedCredits;
                }
            }
        }

        const { data, error } = await supabase
            .from('organizations')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating organization settings:', error);
            return NextResponse.json(
                { error: 'Failed to update organization settings' },
                { status: 500 }
            );
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in PATCH /api/admin/organizations/[id]/settings:', error);
        return NextResponse.json(
            { error: 'Failed to update organization settings', details: error.message },
            { status: 500 }
        );
    }
}
