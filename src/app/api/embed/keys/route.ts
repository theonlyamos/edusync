import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { generateApiKey } from '@/lib/api-key-auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');

    const supabase = await createSSRUserSupabase();

    let query = supabase
      .from('embed_api_keys')
      .select('id, name, description, api_key, allowed_domains, is_active, rate_limit_per_hour, rate_limit_per_day, total_requests, total_minutes_used, last_used_at, created_at, expires_at, organization_id');

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    } else {
      query = query.eq('user_id', session.user.id).is('organization_id', null);
    }

    const { data: apiKeys, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch API keys' },
        { status: 500 }
      );
    }

    return NextResponse.json({ apiKeys });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch API keys', details: error.message },
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
    const {
      name,
      description,
      allowed_domains,
      rate_limit_per_hour,
      rate_limit_per_day,
      expires_at,
      organization_id,
    } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const supabase = await createSSRUserSupabase();

    if (organization_id) {
      const { data: member } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', organization_id)
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .single();

      if (!member || !['owner', 'admin'].includes(member.role)) {
        return NextResponse.json(
          { error: 'Access denied. Only owners and admins can create API keys for the organization.' },
          { status: 403 }
        );
      }
    }

    const apiKey = generateApiKey();

    const insertData: any = {
      user_id: session.user.id,
      api_key: apiKey,
      name: name.trim(),
      description: description?.trim() || null,
      allowed_domains: allowed_domains || null,
      rate_limit_per_hour: rate_limit_per_hour || 100,
      rate_limit_per_day: rate_limit_per_day || 1000,
      expires_at: expires_at || null,
      is_active: true,
    };

    if (organization_id) {
      insertData.organization_id = organization_id;
    }

    const { data, error } = await supabase
      .from('embed_api_keys')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('Failed to create API key:', error);
      return NextResponse.json(
        { error: 'Failed to create API key' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      apiKey: data,
      message: 'API key created successfully. Store it securely - you will not be able to see it again.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to create API key', details: error.message },
      { status: 500 }
    );
  }
}

