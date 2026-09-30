import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://credit-test.invalid',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  }),
}))

import { authenticateRequest, getAuthModeForPath } from '@/lib/auth-middleware'
import { POST as deductMinute } from '@/app/api/credits/deduct-minute/route'
import { POST as deductEmbedMinute } from '@/app/api/embed/credits/deduct-minute/route'
import { addCredits } from '@/lib/credits'
import { deductCreditsFromApiKey } from '@/lib/api-key-auth'

const userId = '10000000-0000-0000-0000-000000000001'
const apiKeyId = '20000000-0000-0000-0000-000000000001'
const sessionId = '30000000-0000-0000-0000-000000000001'
const requests: Array<{ url: URL; headers: Headers; body: Record<string, unknown> | null }> = []
let keyActive = true
let sessionKeyId = apiKeyId

beforeEach(() => {
  requests.length = 0
  keyActive = true
  sessionKeyId = apiKeyId
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const body = request.method === 'POST' ? await request.json() : null
    requests.push({ url, headers: request.headers, body })
    expect(url.origin).toBe('https://credit-test.invalid')
    expect(request.headers.get('authorization')).toBe('Bearer test-service-role-key')
    expect(request.headers.get('apikey')).toBe('test-service-role-key')
    if (url.pathname === '/rest/v1/embed_api_keys') {
      expect(url.searchParams.get('api_key')).toBe('eq.isk_fixture')
      return Response.json([{
        id: apiKeyId,
        user_id: userId,
        name: 'fixture',
        is_active: keyActive,
        expires_at: null,
        allowed_domains: ['demo.test'],
        rate_limit_per_hour: 100,
        rate_limit_per_day: 1000,
        total_requests: 0,
      }])
    }
    if (url.pathname === '/rest/v1/embed_api_key_usage') {
      return new Response(null, { headers: { 'Content-Range': '0-0/0' } })
    }
    if (url.pathname === '/rest/v1/learning_sessions') {
      return Response.json([{ id: sessionId, api_key_id: sessionKeyId, user_id: userId }])
    }
    if (url.pathname === '/rest/v1/rpc/record_api_key_usage' || url.pathname === '/rest/v1/rpc/increment_api_key_minutes') {
      return Response.json(null)
    }
    if (url.pathname === '/rest/v1/rpc/deduct_user_credits') return Response.json(59)
    if (url.pathname === '/rest/v1/rpc/add_user_credits') return Response.json(160)
    throw new Error(`Unexpected database request: ${url.pathname}`)
  }))
})

afterEach(() => vi.unstubAllGlobals())

function embedRequest(path: string, key: string | null = 'isk_fixture') {
  return new NextRequest(`https://demo.test${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://demo.test',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ sessionId }),
  })
}

async function authenticatedRouteRequest(path: string) {
  const request = embedRequest(path)
  const auth = await authenticateRequest(request, NextResponse.next())
  expect(auth.authorized).toBe(true)
  expect(auth.authContext).toMatchObject({ userId, apiKeyId, authType: 'apiKey' })
  const headers = new Headers(request.headers)
  headers.set('x-auth-user-id', auth.authContext!.userId)
  headers.set('x-auth-type', auth.authContext!.authType)
  headers.set('x-auth-api-key-id', auth.authContext!.apiKeyId!)
  return new NextRequest(request, { headers })
}

describe('public iframe billing uses the server service role', () => {
  it('accepts a valid iframe API key without a browser session and bills through the actual tutor route', async () => {
    const path = '/api/credits/deduct-minute'
    expect(getAuthModeForPath(path)).toBe('both')
    const response = await deductMinute(await authenticatedRouteRequest(path))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, remainingCredits: 59 })
    expect(requests.find(({ url }) => url.pathname.endsWith('/deduct_user_credits'))?.body).toEqual({
      p_user_id: userId,
      p_amount: 1,
      p_description: 'Used 1 credit for 1 minute of AI session',
      p_session_id: sessionId,
    })
  })

  it('keeps the dedicated embed route available for an API-key-owned session', async () => {
    const path = '/api/embed/credits/deduct-minute'
    expect(getAuthModeForPath(path)).toBe('apiKey')
    const response = await deductEmbedMinute(await authenticatedRouteRequest(path))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, remainingCredits: 59 })
  })

  it('does not deduct for a session owned by a different API key', async () => {
    sessionKeyId = 'different-key'
    const response = await deductEmbedMinute(await authenticatedRouteRequest('/api/embed/credits/deduct-minute'))
    expect(response.status).toBe(403)
    expect(requests.some(({ url }) => url.pathname.endsWith('/deduct_user_credits'))).toBe(false)
  })

  it('rejects missing, malformed, and disabled keys before a billing route is authorized', async () => {
    for (const key of [null, 'invalid', 'isk_fixture']) {
      keyActive = false
      const auth = await authenticateRequest(embedRequest('/api/credits/deduct-minute', key), NextResponse.next())
      expect(auth.authorized).toBe(false)
    }
    expect(requests.some(({ url }) => url.pathname.endsWith('/deduct_user_credits'))).toBe(false)
  })

  it('keeps API-key deductions and their usage counter on the service-role client', async () => {
    expect(await deductCreditsFromApiKey(apiKeyId, userId, 1)).toEqual({ success: true, remainingCredits: 59 })
    expect(requests.find(({ url }) => url.pathname.endsWith('/deduct_user_credits'))?.body).toMatchObject({
      p_user_id: userId, p_amount: 1, p_session_id: null,
    })
    expect(requests.find(({ url }) => url.pathname.endsWith('/increment_api_key_minutes'))?.body).toEqual({
      p_api_key_id: apiKeyId, p_minutes: 1,
    })
  })

  it('keeps webhook-style credit additions on the service-role client without a user session', async () => {
    expect(await addCredits(userId, 100, 'fixture purchase', 'purchase', 'pi_fixture')).toEqual({ success: true, newTotal: 160 })
    expect(requests.find(({ url }) => url.pathname.endsWith('/add_user_credits'))?.body).toMatchObject({
      p_user_id: userId, p_amount: 100, p_type: 'purchase', p_payment_intent_id: 'pi_fixture',
    })
  })
})
