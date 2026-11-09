import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { USAGE_DAYS, toUsageDays } from '@/lib/embed-usage';
import { createSSRUserSupabase, createServerSupabase } from '@/lib/supabase.server';

/** Requests and sessions per day for one API key, for the last 30 days (UTC). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'API key not found' }, { status: 404 });

    // The person's own access rules decide whether they can see this key.
    const own = await createSSRUserSupabase();
    const { data: key, error: keyError } = await own.from('embed_api_keys').select('id').eq('id', id).maybeSingle();
    if (keyError) throw keyError;
    if (!key) return NextResponse.json({ error: 'API key not found' }, { status: 404 });

    const { data, error } = await createServerSupabase().rpc('embed_key_daily_usage', { p_key_id: id, p_days: USAGE_DAYS });
    if (error) throw error;
    return NextResponse.json({ days: toUsageDays(data) });
  } catch (error) {
    console.error('[GET /api/embed/keys/[id]/usage]', error);
    return NextResponse.json({ error: 'Could not load usage for this key' }, { status: 500 });
  }
}
