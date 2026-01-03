import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';

// GET a specific API key
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; keyId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id, keyId } = await params;
        const supabase = createServerSupabase();

        const { data: apiKey, error } = await supabase
            .from('embed_api_keys')
            .select('*')
            .eq('id', keyId)
            .eq('organization_id', id)
            .single();

        if (error || !apiKey) {
            return NextResponse.json(
                { error: 'API key not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(apiKey);
    } catch (error: any) {
        console.error('Error in GET /api/admin/organizations/[id]/keys/[keyId]:', error);
        return NextResponse.json(
            { error: 'Failed to fetch API key', details: error.message },
            { status: 500 }
        );
    }
}

// PATCH update an API key
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; keyId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id, keyId } = await params;
        const supabase = createServerSupabase();
        const body = await request.json();

        const { name, description, allowed_domains, is_active, rate_limit_per_hour, rate_limit_per_day, expires_at } = body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name.trim();
        if (description !== undefined) updateData.description = description?.trim() || null;
        if (allowed_domains !== undefined) updateData.allowed_domains = allowed_domains;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (rate_limit_per_hour !== undefined) updateData.rate_limit_per_hour = rate_limit_per_hour;
        if (rate_limit_per_day !== undefined) updateData.rate_limit_per_day = rate_limit_per_day;
        if (expires_at !== undefined) updateData.expires_at = expires_at;

        const { data, error } = await supabase
            .from('embed_api_keys')
            .update(updateData)
            .eq('id', keyId)
            .eq('organization_id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating API key:', error);
            return NextResponse.json(
                { error: 'Failed to update API key' },
                { status: 500 }
            );
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in PATCH /api/admin/organizations/[id]/keys/[keyId]:', error);
        return NextResponse.json(
            { error: 'Failed to update API key', details: error.message },
            { status: 500 }
        );
    }
}

// DELETE an API key
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; keyId: string }> }
) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id, keyId } = await params;
        const supabase = createServerSupabase();

        const { error } = await supabase
            .from('embed_api_keys')
            .delete()
            .eq('id', keyId)
            .eq('organization_id', id);

        if (error) {
            console.error('Error deleting API key:', error);
            return NextResponse.json(
                { error: 'Failed to delete API key' },
                { status: 500 }
            );
        }

        return new NextResponse(null, { status: 204 });
    } catch (error: any) {
        console.error('Error in DELETE /api/admin/organizations/[id]/keys/[keyId]:', error);
        return NextResponse.json(
            { error: 'Failed to delete API key', details: error.message },
            { status: 500 }
        );
    }
}
