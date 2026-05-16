import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export const AGENT_SECRET_HEADER = 'x-live-class-agent-secret'

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function agentSecretOk(received: string | null, expected: string): boolean {
  if (!received) return false
  const a = Buffer.from(received, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Validates the shared agent secret from the request header.
 * Returns a 401 NextResponse if invalid, or null if OK.
 */
export function validateAgentSecret(request: NextRequest): NextResponse | null {
  const secret = request.headers.get(AGENT_SECRET_HEADER)
  const expected = process.env.LIVE_CLASS_AGENT_SECRET
  if (!expected || !agentSecretOk(secret, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
