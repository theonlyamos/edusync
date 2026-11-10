import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import https from 'node:https';
import type { AddressInfo, LookupFunction } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { deliveryNote, isNonPublicAddress, parseWebhookUrl } from '@/lib/webhooks';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: () => { throw new Error('not used'); } }));
const { deliverWebhook, publicOnlyLookup, signWebhook, webhookEvent, newWebhookSecret } = await import('@/lib/webhooks.server');

describe('parseWebhookUrl', () => {
  it('accepts a public https address and drops the fragment', () => {
    expect(parseWebhookUrl(' https://Example.com/hooks/insyte?x=1#top ')).toEqual({ ok: true, url: 'https://example.com/hooks/insyte?x=1', host: 'example.com' });
  });

  it.each([
    ['http://example.com/hook', 'https'],
    ['https://user:pass@example.com/hook', 'username'],
    ['https://example.com:8443/hook', 'port'],
    ['https://127.0.0.1/hook', 'public website name'],
    ['https://[::1]/hook', 'public website name'],
    ['https://localhost/hook', 'public website name'],
    ['https://intranet/hook', 'public website name'],
    ['https://db.internal/hook', 'public website name'],
    ['https://printer.local/hook', 'public website name'],
    ['ftp://example.com', 'https'],
    ['not a url', 'web address'],
    ['', 'Enter'],
  ])('refuses %s', (input, reason) => {
    const result = parseWebhookUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(reason);
  });

  it('refuses anything that is not text, and very long addresses', () => {
    expect(parseWebhookUrl(null).ok).toBe(false);
    expect(parseWebhookUrl({ url: 'https://example.com' }).ok).toBe(false);
    expect(parseWebhookUrl(`https://example.com/${'a'.repeat(600)}`).ok).toBe(false);
  });
});

describe('isNonPublicAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.0.1', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', '64:ff9b::10.0.0.1', '2001:db8::1',
    'not-an-address', '',
  ])('treats %s as not public', (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '2a00:1450:4009::200e', '::ffff:8.8.8.8'])('treats %s as public', (address) => {
    expect(isNonPublicAddress(address)).toBe(false);
  });
});

describe('signing', () => {
  it('signs the time, a dot and the body with HMAC-SHA256', () => {
    const expected = createHmac('sha256', 'whsec_test').update('1700000000.{"a":1}').digest('hex');
    expect(signWebhook('whsec_test', 1700000000, '{"a":1}')).toBe(`t=1700000000,v1=${expected}`);
  });

  it('makes long, distinct secrets and event ids', () => {
    expect(newWebhookSecret()).toMatch(/^whsec_[0-9a-f]{64}$/);
    expect(newWebhookSecret()).not.toBe(newWebhookSecret());
    expect(webhookEvent('webhook.test', {}).id).toMatch(/^evt_[0-9a-f]{32}$/);
  });
});

describe('deliveryNote', () => {
  it('describes how a delivery went', () => {
    expect(deliveryNote(204, null)).toBe('Delivered (204)');
    expect(deliveryNote(500, null)).toBe('Your server answered 500');
    expect(deliveryNote(null, 'Your server took too long to answer')).toBe('Your server took too long to answer');
  });
});

describe('publicOnlyLookup', () => {
  const resolve = (host: string) => new Promise<string | undefined>((done) => publicOnlyLookup(host, {}, (error) => done((error as { code?: string } | null)?.code)));

  it('refuses names that lead to this machine', async () => {
    expect(await resolve('localhost')).toBe('ENOTPUBLIC');
  });
});

describe('deliverWebhook', () => {
  let server: https.Server;
  let port = 0;
  let received: Array<{ headers: Record<string, unknown>; body: string; path: string }> = [];
  let answer = 200;
  // The receiver runs on this machine, so these tests stand in a lookup that points at it.
  const toLocal: LookupFunction = (_host, options, callback) => {
    if (typeof options === 'object' && options.all) return (callback as unknown as (e: null, a: unknown) => void)(null, [{ address: '127.0.0.1', family: 4 }]);
    callback(null, '127.0.0.1', 4);
  };

  beforeAll(async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hook-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=hooks.example.com', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem')], { stdio: 'ignore' });
    server = https.createServer({ key: readFileSync(path.join(dir, 'k.pem')), cert: readFileSync(path.join(dir, 'c.pem')) }, (request, response) => {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        received.push({ headers: request.headers, body, path: request.url ?? '' });
        if (answer === 302) response.writeHead(302, { Location: 'https://169.254.169.254/latest/meta-data/' });
        else response.writeHead(answer);
        response.end('secret answer');
      });
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((done) => { server.close(() => done()); }));

  const send = (url = 'https://hooks.example.com/in?x=1') => {
    received = [];
    return deliverWebhook(url, 'whsec_test', webhookEvent('session.started', { sessionId: 's1' }), { lookup: toLocal, rejectUnauthorized: false, port });
  };

  it('posts the signed event to the address', async () => {
    answer = 200;
    expect(await send()).toEqual({ status: 200, error: null });
    const [hit] = received;
    expect(hit.path).toBe('/in?x=1');
    expect(hit.headers['x-insyte-event']).toBe('session.started');
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(hit.headers['x-insyte-signature'])) ?? [];
    expect(createHmac('sha256', 'whsec_test').update(`${t}.${hit.body}`).digest('hex')).toBe(v1);
    expect(JSON.parse(hit.body)).toMatchObject({ type: 'session.started', data: { sessionId: 's1' } });
  });

  it('reports the status when the server says no', async () => {
    answer = 500;
    expect(await send()).toEqual({ status: 500, error: null });
  });

  it('does not follow a redirect', async () => {
    answer = 302;
    expect(await send()).toEqual({ status: 302, error: null });
    expect(received).toHaveLength(1);
  });

  it('refuses a certificate it cannot verify', async () => {
    const result = await deliverWebhook('https://hooks.example.com/in', 'whsec_test', webhookEvent('webhook.test', {}), { lookup: toLocal, port });
    expect(result.status).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('never connects when the address is not allowed or leads to a private server', async () => {
    received = [];
    expect((await deliverWebhook('http://hooks.example.com/in', 's', webhookEvent('webhook.test', {}), { lookup: toLocal, port })).status).toBeNull();
    const local = await deliverWebhook('https://localhost.example.com/in', 's', webhookEvent('webhook.test', {}), {
      port,
      rejectUnauthorized: false,
      lookup: (host, options, callback) => publicOnlyLookup('localhost', options, callback),
    });
    expect(local).toEqual({ status: null, error: 'The address does not lead to a public server' });
    expect(received).toHaveLength(0);
  });
});
