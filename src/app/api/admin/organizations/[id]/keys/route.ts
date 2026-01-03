import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import { generateApiKey } from '@/lib/api-key-auth';

// GET all API keys for an organization
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

        const { data: apiKeys, error } = await supabase
            .from('embed_api_keys')
            .select('*')
            .eq('organization_id', id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching API keys:', error);
            return NextResponse.json(
                { error: 'Failed to fetch API keys' },
                { status: 500 }
            );
        }

        return NextResponse.json(apiKeys ?? []);
    } catch (error: any) {
        console.error('Error in GET /api/admin/organizations/[id]/keys:', error);
        return NextResponse.json(
            { error: 'Failed to fetch API keys', details: error.message },
            { status: 500 }
        );
    }
}

// POST create a new API key for an organization
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
        const { name, description, allowed_domains, rate_limit_per_hour, rate_limit_per_day, expires_at } = body;

        if (!name || name.trim().length === 0) {
            return NextResponse.json(
                { error: 'Name is required' },
                { status: 400 }
            );
        }

        // Verify organization exists
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('id')
            .eq('id', id)
            .single();

        if (orgError || !org) {
            return NextResponse.json(
                { error: 'Organization not found' },
                { status: 404 }
            );
        }

        const apiKey = generateApiKey();

        const { data, error } = await supabase
            .from('embed_api_keys')
            .insert({
                user_id: session.user.id,
                organization_id: id,
                api_key: apiKey,
                name: name.trim(),
                description: description?.trim() || null,
                allowed_domains: allowed_domains || null,
                rate_limit_per_hour: rate_limit_per_hour || 100,
                rate_limit_per_day: rate_limit_per_day || 1000,
                expires_at: expires_at || null,
                is_active: true,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating API key:', error);
            return NextResponse.json(
                { error: 'Failed to create API key' },
                { status: 500 }
            );
        }

        return NextResponse.json(data, { status: 201 });
    } catch (error: any) {
        console.error('Error in POST /api/admin/organizations/[id]/keys:', error);
        return NextResponse.json(
            { error: 'Failed to create API key', details: error.message },
            { status: 500 }
        );
    }
}
