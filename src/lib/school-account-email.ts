import { gradeLevelLabel } from '@/lib/school-registration'

export type AccountEmailDetails = {
  kind: 'activate' | 'reset'
  schoolName: string
  senderName: string | null
  personName: string | null
  role: string
  gradeLevel: string | null
  email: string
  url: string
  expiresAt: Date
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string)

function roleText(role: string, gradeLevel: string | null): string {
  if (role === 'student') return gradeLevel ? `a student in ${gradeLevelLabel(gradeLevel)}` : 'a student'
  if (role === 'admin' || role === 'owner') return 'a school administrator'
  return 'a teacher'
}

/** Subject, HTML and plain text for an account activation or password email from a school. */
export function buildSchoolAccountEmail(details: AccountEmailDetails): { subject: string; html: string; text: string } {
  const greeting = details.personName ? `Hi ${details.personName},` : 'Hi,'
  const expires = details.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const by = details.senderName ? ` (${details.senderName})` : ''
  const activate = details.kind === 'activate'
  const subject = activate ? `Activate your ${details.schoolName} account on InsyteAI` : `Set a new InsyteAI password`
  const intro = activate
    ? `${details.schoolName}${by} has created an InsyteAI account for you as ${roleText(details.role, details.gradeLevel)}. Choose a password to activate it.`
    : `${details.schoolName}${by} sent you a link to set a new InsyteAI password.`
  const button = activate ? 'Activate my account' : 'Set a new password'
  const signIn = `You will sign in with ${details.email}.`
  const ending = activate
    ? `The link works until ${expires}. If you were not expecting this, you can ignore this email.`
    : `The link works until ${expires}. If you did not ask for this, you can ignore it and your password stays the same.`

  const text = [greeting, '', intro, signIn, '', `${button}: ${details.url}`, '', ending].join('\n')

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px" cellspacing="0" cellpadding="0"><tr><td>
<p style="margin:0 0 16px;font-size:16px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${escapeHtml(intro)}</p>
<p style="margin:0 0 24px;font-size:14px;color:#374151">${escapeHtml(signIn)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(details.url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(button)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#6b7280">Or open this link: <a href="${escapeHtml(details.url)}" style="color:#4f46e5;word-break:break-all">${escapeHtml(details.url)}</a></p>
<p style="margin:0;font-size:13px;color:#6b7280">${escapeHtml(ending)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`

  return { subject, html, text }
}
