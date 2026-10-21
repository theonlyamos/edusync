const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string)

/** Subject, HTML and plain text for a password reset that support sent. */
export function buildPasswordResetEmail({ name, url }: { name: string | null; url: string }) {
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const subject = 'Set a new InsyteAI password'
  const text = [
    greeting,
    '',
    'InsyteAI support sent you a link to set a new password.',
    '',
    `Set your password: ${url}`,
    '',
    'The link works once and expires soon. If you did not ask for this, you can ignore this email and your password stays the same.',
  ].join('\n')

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px" cellspacing="0" cellpadding="0"><tr><td>
<p style="margin:0 0 16px;font-size:16px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5">InsyteAI support sent you a link to set a new password.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Set a new password</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#6b7280">Or open this link: <a href="${escapeHtml(url)}" style="color:#4f46e5;word-break:break-all">${escapeHtml(url)}</a></p>
<p style="margin:0;font-size:13px;color:#6b7280">The link works once and expires soon. If you did not ask for this, you can ignore this email and your password stays the same.</p>
</td></tr></table>
</td></tr></table>
</body></html>`

  return { subject, html, text }
}
