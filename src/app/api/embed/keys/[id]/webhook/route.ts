import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import { parseWebhookUrl, type WebhookSummary } from '@/lib/webhooks';
import { manageableKey, newWebhookSecret } from '@/lib/webhooks.server';

type Params = { params: Promise<{ id: string }> };

const COLUMNS = 'url, last_delivery_at, last_status, last_error';
type Row = { url: string; last_delivery_at: string | null; last_status: number | null; last_error: string | null };
const summary = (row: Row): WebhookSummary => ({
  url: row.url,
  lastDeliveryAt: row.last_delivery_at,
  lastStatus: row.last_status,
  lastError: row.last_error,
});

async function keyFor(params: Params['params']) {
  const session = await getServerSession();
  if (!session?.user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const key = await manageableKey(session.user.id, (await params).id);
  if (!key) return { response: NextResponse.json({ error: 'API key not found' }, { status: 404 }) };
  return { key };
}

/** The key's webhook, without its secret. `webhook` is null when none is set. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { key, response } = await keyFor(params);
    if (!key) return response;
    const { data, error } = await createServerSupabase().from('embed_webhooks').select(COLUMNS).eq('api_key_id', key.id).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ webhook: data ? summary(data) : null });
  } catch (error) {
    console.error('[GET webhook]', error);
    return NextResponse.json({ error: 'Could not load the webhook' }, { status: 500 });
  }
}

/**
 * Sets the address. A new webhook, or `rotate: true`, makes a new signing
 * secret, which is returned this one time.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { key, response } = await keyFor(params);
    if (!key) return response;
    const body = await request.json().catch(() => ({}));
    const parsed = parseWebhookUrl(body?.url);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = createServerSupabase();
    const { data: existing, error: readError } = await supabase.from('embed_webhooks').select('api_key_id').eq('api_key_id', key.id).maybeSingle();
    if (readError) throw readError;
    const secret = !existing || body?.rotate === true ? newWebhookSecret() : null;
    const changes = { url: parsed.url, updated_at: new Date().toISOString(), ...(secret ? { secret } : {}) };
    const write = existing
      ? supabase.from('embed_webhooks').update(changes).eq('api_key_id', key.id)
      : supabase.from('embed_webhooks').insert({ api_key_id: key.id, ...changes });
    const { data, error } = await write.select(COLUMNS).single();
    if (error) throw error;
    return NextResponse.json({ webhook: summary(data), secret });
  } catch (error) {
    console.error('[PUT webhook]', error);
    return NextResponse.json({ error: 'Could not save the webhook' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { key, response } = await keyFor(params);
    if (!key) return response;
    const { error } = await createServerSupabase().from('embed_webhooks').delete().eq('api_key_id', key.id);
    if (error) throw error;
    return NextResponse.json({ webhook: null });
  } catch (error) {
    console.error('[DELETE webhook]', error);
    return NextResponse.json({ error: 'Could not remove the webhook' }, { status: 500 });
  }
}
