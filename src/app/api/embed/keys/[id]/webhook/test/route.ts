import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import { deliveryNote } from '@/lib/webhooks';
import { manageableKey, sendKeyEvent } from '@/lib/webhooks.server';

const COOLDOWN_MS = 10_000;

/** Sends a `webhook.test` event to the key's webhook and says how it went. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const key = await manageableKey(session.user.id, (await params).id);
    if (!key) return NextResponse.json({ error: 'API key not found' }, { status: 404 });

    const { data: hook, error } = await createServerSupabase().from('embed_webhooks').select('last_delivery_at').eq('api_key_id', key.id).maybeSingle();
    if (error) throw error;
    if (!hook) return NextResponse.json({ error: 'Save a webhook address first.' }, { status: 400 });
    // Keeps this button from being used to send a stream of requests at someone's server.
    if (hook.last_delivery_at && Date.now() - new Date(hook.last_delivery_at).getTime() < COOLDOWN_MS) {
      return NextResponse.json({ error: 'Please wait a few seconds before sending another test.' }, { status: 429 });
    }

    const result = await sendKeyEvent(key.id, 'webhook.test', { message: 'This is a test event from InsyteAI.' });
    if (!result) return NextResponse.json({ error: 'Could not send the test event' }, { status: 500 });
    const delivered = result.status !== null && result.status >= 200 && result.status < 300;
    return NextResponse.json({ delivered, status: result.status, note: deliveryNote(result.status, result.error) });
  } catch (error) {
    console.error('[POST webhook test]', error);
    return NextResponse.json({ error: 'Could not send the test event' }, { status: 500 });
  }
}
