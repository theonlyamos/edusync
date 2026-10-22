import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase.server'
import { rateLimit } from '@/lib/rate-limiter'
import { completeAccountLink, findAccountLink, peopleErrorResponse } from '@/lib/school-people.server'
import { validateNewPassword } from '@/lib/password-reset'

type Params = { params: Promise<{ token: string }> }

/** What an activation or password link is for, so the page can greet the person. */
export async function GET(request: NextRequest, { params }: Params) {
  const limited = await rateLimit(request, 'auth')
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
  const limited = await rateLimit(request, 'auth')
  if (limited) return limited
  try {
    const { token } = await params
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
