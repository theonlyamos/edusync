import 'server-only';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { createServerSupabase } from '@/lib/supabase.server';
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMEOUT_MS,
  isNonPublicAddress,
  parseWebhookUrl,
  signatureHeader,
  signedText,
  type WebhookEvent,
  type WebhookEventType,
} from '@/lib/webhooks';

export const newWebhookSecret = () => `whsec_${randomBytes(32).toString('hex')}`;

export const signWebhook = (secret: string, timestamp: number, body: string) =>
  signatureHeader(timestamp, createHmac('sha256', secret).update(signedText(timestamp, body)).digest('hex'));

/**
 * Name lookup for the outgoing connection that refuses anything but public
 * addresses. It runs for the connection itself, so a name that answers with a
 * public address when checked and a private one when used gets nowhere.
 */
export const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...(typeof options === 'object' ? options : {}), all: true }, (error, addresses) => {
    if (error) return callback(error, '', 4);
    const list = Array.isArray(addresses) ? addresses : [];
    if (list.length === 0 || list.some((entry) => isNonPublicAddress(entry.address))) {
      return callback(Object.assign(new Error('not a public address'), { code: 'ENOTPUBLIC' }), '', 4);
    }
    if (typeof options === 'object' && options.all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export type DeliveryResult = { status: number | null; error: string | null };

type DeliverOptions = { lookup?: LookupFunction; rejectUnauthorized?: boolean; port?: number };

const failure = (error: unknown): string => {
  const code = (error as { code?: string })?.code;
  if (code === 'ENOTPUBLIC') return 'The address does not lead to a public server';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'The server name could not be found';
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return 'Your server took too long to answer';
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return 'Your server refused the connection';
  if (typeof code === 'string' && /CERT|SSL|TLS/.test(code)) return 'Your server’s security certificate was not accepted';
  return 'Could not reach your server';
};

/**
 * Sends one signed event. One attempt, a short time limit, redirects are not
 * followed and the answer's body is thrown away, so the request cannot be
 * steered somewhere else or used to read anything back.
 * `options` exists for tests; production callers pass none.
 */
export function deliverWebhook(url: string, secret: string, event: WebhookEvent, options: DeliverOptions = {}): Promise<DeliveryResult> {
  const parsed = parseWebhookUrl(url);
  if (!parsed.ok) return Promise.resolve({ status: null, error: parsed.error });
  const target = new URL(parsed.url);
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: DeliveryResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const request = https.request({
      method: 'POST',
      hostname: target.hostname,
      port: options.port ?? 443,
      path: `${target.pathname}${target.search}`,
      lookup: options.lookup ?? publicOnlyLookup,
      rejectUnauthorized: options.rejectUnauthorized ?? true,
      agent: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'InsyteAI-Webhooks/1.0',
        [WEBHOOK_SIGNATURE_HEADER]: signWebhook(secret, timestamp, body),
        'X-Insyte-Event': event.type,
        'X-Insyte-Delivery': event.id,
      },
    }, (response) => {
      response.resume();
      done({ status: response.statusCode ?? null, error: null });
      request.destroy();
    });
    // The whole exchange has one deadline, however slowly the other side trickles.
    const timer = setTimeout(() => {
      request.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    }, WEBHOOK_TIMEOUT_MS);
    request.on('error', (error) => done({ status: null, error: failure(error) }));
    request.end(body);
  });
}

export const webhookEvent = (type: WebhookEventType, data: Record<string, unknown>): WebhookEvent => ({
  id: `evt_${randomUUID().replace(/-/g, '')}`,
  type,
  created: new Date().toISOString(),
  data,
});

/**
 * Sends an event to the key's webhook, if it has one, and records how it
 * went. Never throws: a customer's server being down must not break a session.
 */
export async function sendKeyEvent(apiKeyId: string | null | undefined, type: WebhookEventType, data: Record<string, unknown>): Promise<DeliveryResult | null> {
  if (!apiKeyId) return null;
  try {
    const supabase = createServerSupabase();
    const { data: hook, error } = await supabase.from('embed_webhooks').select('url, secret').eq('api_key_id', apiKeyId).maybeSingle();
    if (error || !hook) return null;
    const result = await deliverWebhook(hook.url, hook.secret, webhookEvent(type, data));
    await supabase.from('embed_webhooks').update({
      last_delivery_at: new Date().toISOString(),
      last_status: result.status,
      last_error: result.error ? result.error.slice(0, 300) : null,
    }).eq('api_key_id', apiKeyId);
    return result;
  } catch (error) {
    console.error('[webhooks] delivery failed', (error as Error)?.message);
    return null;
  }
}

/**
 * The key, if this person may manage its webhook: their own personal key, or
 * a key of an organisation they own or administer.
 */
export async function manageableKey(userId: string, keyId: string): Promise<{ id: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(keyId)) return null;
  const supabase = createServerSupabase();
  const { data: key } = await supabase.from('embed_api_keys').select('id, user_id, organization_id').eq('id', keyId).maybeSingle();
  if (!key) return null;
  if (!key.organization_id) return key.user_id === userId ? { id: key.id } : null;
  const { data: member } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', key.organization_id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  return member && ['owner', 'admin'].includes(member.role) ? { id: key.id } : null;
}
