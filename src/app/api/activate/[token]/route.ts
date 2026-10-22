import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase.server'
import { rateLimit } from '@/lib/rate-limiter'
import { completeAccountLink, findAccountLink, hashLinkToken, peopleErrorResponse } from '@/lib/school-people.server'
import { validateNewPassword } from '@/lib/password-reset'

type Params = { params: Promise<{ token: string }> }

const TOKEN_TRIES = 10
const TOKEN_WINDOW_SECONDS = 15 * 60

/**
 * A whole class may activate from one school network at once, so these routes
 * don't use the strict per-IP sign-in bucket. Tokens can't be guessed; the
 * per-IP API limit stops scanning and this caps tries on any one link.
 */
async function tooManyTriesOnLink(token: string): Promise<NextResponse | null> {
  try {
    const { data, error } = await createServerSupabase().rpc('hit_rate_limit', {
      p_key: `activate:${hashLinkToken(token).slice(0, 32)}`,
      p_max: TOKEN_TRIES,
      p_window_seconds: TOKEN_WINDOW_SECONDS,
    })
    if (error || data !== false) return null
  } catch {
    return null
  }
  return NextResponse.json({ error: 'Too many tries with this link. Wait 15 minutes and try again.' }, { status: 429 })
}

/** What an activation or password link is for, so the page can greet the person. */
export async function GET(request: NextRequest, { params }: Params) {
  const limited = await rateLimit(request, 'api')
  if (limited) return limited
  try {
    const { token } = await params
    const link = await findAccountLink(createServerSupabase(), token)
    if (!link) return NextResponse.json({ state: 'invalid' }, { status: 404 })
    return NextResponse.json({
      state: link.state,
      kind: link.kind,
      email: link.email,
      name: link.name,
      role: link.role,
      school: { name: link.schoolName },
    })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Could not check this link', 'GET /api/activate/[token]')
    return NextResponse.json(body, { status })
  }
}

/** Sets the password: { password }. The page then signs in with it. */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = await rateLimit(request, 'api')
  if (limited) return limited
  try {
    const { token } = await params
    const linkLimited = await tooManyTriesOnLink(token)
    if (linkLimited) return linkLimited
    const body = await request.json().catch(() => null)
    const password = typeof body?.password === 'string' ? body.password : ''
    const problem = validateNewPassword(password, password)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    const result = await completeAccountLink(createServerSupabase(), token, password)
    return NextResponse.json(result)
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Could not save your password', 'POST /api/activate/[token]')
    return NextResponse.json(body, { status })
  }
}
