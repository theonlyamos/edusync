import { NextRequest, NextResponse } from 'next/server'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { buildPasswordResetEmail } from '@/lib/password-reset-email'
import { resetLinkFromTokenHash, RESET_PASSWORD_PATH } from '@/lib/password-reset'
import { requirePlatformAdmin } from '@/lib/platform-admin.server'
import { appOrigin } from '@/lib/app-origin'

/**
 * Support action: email someone a link to set a new password. The link goes
 * only to the account's own address; support never sees it or types a password.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  const { supabase } = access.context
  const { userId } = await params

  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: 'Email is not set up yet (RESEND_API_KEY and EMAIL_FROM). Ask the person to use “Forgot password?” on the sign-in page.' },
      { status: 503 },
    )
  }

  const { data: user, error } = await supabase.from('users').select('id, email, name').eq('id', userId).maybeSingle()
  if (error) {
    console.error('Password reset lookup failed:', error)
    return NextResponse.json({ error: 'Could not load this account.' }, { status: 500 })
  }
  if (!user?.email) return NextResponse.json({ error: 'Account not found.' }, { status: 404 })

  const origin = appOrigin(request)
  const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: user.email,
    options: { redirectTo: `${origin}${RESET_PASSWORD_PATH}` },
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    console.error('Password reset link failed:', linkError)
    return NextResponse.json({ error: 'Could not create a reset link for this account.' }, { status: 500 })
  }

  const result = await sendEmail({
    to: user.email,
    ...buildPasswordResetEmail({ name: user.name ?? null, url: resetLinkFromTokenHash(origin, tokenHash) }),
  })
  if (!result.sent) return NextResponse.json({ error: 'The email did not send. Please try again.' }, { status: 502 })

  return NextResponse.json({ sent: true, email: user.email })
}
