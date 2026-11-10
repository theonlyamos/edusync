import { parseRateLimits } from '@/lib/api-key-limits';
import { allowedDomainsSchema } from '@/lib/validation/api-key-domains';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      name,
      description,
      allowed_domains,
      is_active,
      expires_at,
    } = body;

    const supabase = await createSSRUserSupabase();

    const domains = allowedDomainsSchema.safeParse(allowed_domains);
    if (!domains.success) {
      return NextResponse.json({ error: domains.error.issues[0].message }, { status: 400 });
    }
    const limits = parseRateLimits(body, 'owner');
    if (!limits.ok) {
      return NextResponse.json({ error: limits.error }, { status: 400 });
    }
    const updateData: any = { ...limits.values };
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (allowed_domains !== undefined) updateData.allowed_domains = domains.data;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (expires_at !== undefined) updateData.expires_at = expires_at;

    const { data, error } = await supabase
      .from('embed_api_keys')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', session.user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update API key' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ apiKey: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update API key', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const { error } = await supabase
      .from('embed_api_keys')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete API key' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'API key deleted successfully' });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to delete API key', details: error.message },
      { status: 500 }
    );
  }
}

