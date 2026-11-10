/** Webhooks for embed API keys: the rules shared by the server, the page and tests. */

export const WEBHOOK_EVENTS = ['session.started', 'session.ended', 'webhook.test'] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export type WebhookEvent = {
  id: string;
  type: WebhookEventType;
  created: string;
  data: Record<string, unknown>;
};

/** What the API keys page shows about a key's webhook. The secret is only sent when it is first made or replaced. */
export type WebhookSummary = {
  url: string;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
};

export const WEBHOOK_SIGNATURE_HEADER = 'X-Insyte-Signature';
export const WEBHOOK_TIMEOUT_MS = 5000;

/**
 * Checks a webhook address a person typed. Only https on the standard port,
 * with a real hostname: no sign-in details, no bare IP addresses, no local names.
 */
export function parseWebhookUrl(input: unknown): { ok: true; url: string; host: string } | { ok: false; error: string } {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'Enter the address that should receive events.' };
  const text = input.trim();
  if (text.length > 500) return { ok: false, error: 'That address is too long.' };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: 'That doesn’t look like a web address. It should start with https://' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'The address must start with https://' };
  if (url.username || url.password) return { ok: false, error: 'The address can’t include a username or password.' };
  if (url.port && url.port !== '443') return { ok: false, error: 'The address must use the standard https port.' };
  const host = url.hostname.toLowerCase();
  const local = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal');
  const bareIp = /^\d+(\.\d+){3}$/.test(host) || host.includes(':') || host.startsWith('[');
  if (local || bareIp || !host.includes('.')) return { ok: false, error: 'The address must be a public website name, not an IP address or a local name.' };
  url.hash = '';
  return { ok: true, url: url.toString(), host };
}

const v4 = (address: string): number[] | null => {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return numbers.every((n) => n >= 0 && n <= 255) ? numbers : null;
};

/**
 * True for any address that is not a public internet address: loopback,
 * private networks, link-local (which includes cloud metadata services),
 * carrier NAT, multicast and reserved ranges. Unknown shapes count as not public.
 */
export function isNonPublicAddress(address: string): boolean {
  const text = address.trim().toLowerCase();
  const four = v4(text);
  if (four) {
    const [a, b] = four;
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (!text.includes(':')) return true;
  // IPv4 written inside IPv6 (::ffff:10.0.0.1 and the like) follows the IPv4 rules.
  const mapped = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (mapped) return isNonPublicAddress(mapped[1]);
  if (text === '::' || text === '::1' || text.startsWith('::ffff:')) return true;
  const first = parseInt(text.split(':')[0] || '0', 16);
  if (Number.isNaN(first)) return true;
  // Only global unicast (2000::/3) is public; fc00::/7, fe80::/10, ff00::/8 and the rest are not.
  return (first & 0xe000) !== 0x2000 || text.startsWith('2001:db8:');
}

/** The exact text that is signed: the time, a dot, then the body as sent. */
export const signedText = (timestamp: number, body: string) => `${timestamp}.${body}`;

/** The signature header value: `t=<unix seconds>,v1=<hex HMAC-SHA256>`. */
export const signatureHeader = (timestamp: number, digestHex: string) => `t=${timestamp},v1=${digestHex}`;

/** A short, safe note about a failed delivery to show the key's owner. */
export function deliveryNote(status: number | null, error: string | null): string {
  if (status !== null && status >= 200 && status < 300) return `Delivered (${status})`;
  if (status !== null) return `Your server answered ${status}`;
  return error || 'Could not reach your server';
}
