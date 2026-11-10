/**
 * Which websites may show the embedded tutor in a frame, worked out from an
 * API key's allowed domains. Pure, so the proxy and tests share it.
 */

const HOST = /^(\*\.)?[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const LOCAL = new Set(['localhost', '127.0.0.1']);

/** A key with no allowed domains can be framed anywhere. */
export const hasDomainLimit = (domains: string[] | null | undefined): domains is string[] =>
  Array.isArray(domains) && domains.length > 0;

/**
 * The `frame-ancestors` sources for a key. Entries that are not plain
 * hostnames are dropped, so nothing from the database can add a directive.
 */
export function frameAncestorSources(domains: string[] | null | undefined): string {
  if (!hasDomainLimit(domains)) return '*';
  const sources = new Set<string>(["'self'"]);
  for (const entry of domains) {
    const domain = String(entry).trim().toLowerCase();
    if (!HOST.test(domain)) continue;
    if (domain.startsWith('*.')) {
      // "*.example.com" covers example.com too, the same as the API check.
      sources.add(`https://${domain.slice(2)}`);
      sources.add(`https://${domain}`);
    } else if (LOCAL.has(domain)) {
      // Local development runs over plain http on any port.
      sources.add(`http://${domain}:*`);
      sources.add(`https://${domain}:*`);
    } else {
      sources.add(`https://${domain}`);
    }
  }
  return [...sources].join(' ');
}

/**
 * True when a limited key's tutor page is being opened as a page of its own
 * (a new tab or a pasted link) instead of inside a frame. Browsers that don't
 * say (no Sec-Fetch-Dest) are let through: the frame rule still applies.
 */
export const openedOutsideFrame = (domains: string[] | null | undefined, fetchDest: string | null): boolean =>
  hasDomainLimit(domains) && fetchDest === 'document';
