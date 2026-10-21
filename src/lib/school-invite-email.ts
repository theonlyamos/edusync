import { gradeLevelLabel } from '@/lib/school-registration'
import { inviteRoleLabel } from '@/lib/school-invites'

export type InviteEmailDetails = {
  schoolName: string
  inviterName: string | null
  inviteeName: string | null
  role: string
  gradeLevel: string | null
  url: string
  expiresAt: Date
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string)

function roleText(role: string, gradeLevel: string | null): string {
  if (role === 'student') return gradeLevel ? `a student in ${gradeLevelLabel(gradeLevel)}` : 'a student'
  if (role === 'admin') return 'a school admin'
  return `a ${inviteRoleLabel(role).toLowerCase()}`
}

/** Subject, HTML and plain text for a school invite email. */
export function buildInviteEmail(details: InviteEmailDetails): { subject: string; html: string; text: string } {
  const who = details.inviterName ? `${details.inviterName} has invited you` : 'You have been invited'
  const as = roleText(details.role, details.gradeLevel)
  const greeting = details.inviteeName ? `Hi ${details.inviteeName},` : 'Hi,'
  const expires = details.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const subject = `Join ${details.schoolName} on InsyteAI`

  const text = [
    greeting,
    '',
    `${who} to join ${details.schoolName} on InsyteAI as ${as}.`,
    '',
    `Accept the invite: ${details.url}`,
    '',
    `The link works until ${expires}. If you did not expect this email, you can ignore it.`,
  ].join('\n')

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px" cellspacing="0" cellpadding="0"><tr><td>
<p style="margin:0 0 16px;font-size:16px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5">${escapeHtml(who)} to join <strong>${escapeHtml(details.schoolName)}</strong> on InsyteAI as ${escapeHtml(as)}.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(details.url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Accept invite</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#6b7280">Or open this link: <a href="${escapeHtml(details.url)}" style="color:#4f46e5;word-break:break-all">${escapeHtml(details.url)}</a></p>
<p style="margin:0;font-size:13px;color:#6b7280">The link works until ${escapeHtml(expires)}. If you did not expect this email, you can ignore it.</p>
</td></tr></table>
</td></tr></table>
</body></html>`

  return { subject, html, text }
}
