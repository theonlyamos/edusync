/**
 * Sends email through Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Needs RESEND_API_KEY and EMAIL_FROM, e.g. "InsyteAI <invites@your-domain.com>"
 * on a domain verified in Resend. Without them nothing is sent and callers
 * fall back to showing the link.
 */

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

export type EmailResult = { sent: true; id: string | null } | { sent: false; reason: 'not_configured' | 'failed'; error?: string }

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) return { sent: false, reason: 'not_configured' }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toResend(from, message)),
      signal: AbortSignal.timeout(10_000),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const error = typeof body?.message === 'string' ? body.message : `Resend returned ${response.status}`
      console.error('Email send failed:', error)
      return { sent: false, reason: 'failed', error }
    }
    return { sent: true, id: typeof body?.id === 'string' ? body.id : null }
  } catch (error) {
    console.error('Email send failed:', error)
    return { sent: false, reason: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

const toResend = (from: string, message: EmailMessage) => ({
  from,
  to: [message.to],
  subject: message.subject,
  html: message.html,
  text: message.text,
  ...(message.replyTo ? { reply_to: message.replyTo } : {}),
})

/**
 * Sends many emails with Resend's batch endpoint, 100 per call. Returns one
 * result per message, in order.
 */
export async function sendEmails(messages: EmailMessage[]): Promise<EmailResult[]> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) return messages.map(() => ({ sent: false, reason: 'not_configured' }))
  if (messages.length === 1) return [await sendEmail(messages[0])]

  const results: EmailResult[] = []
  for (let i = 0; i < messages.length; i += 100) {
    const part = messages.slice(i, i + 100)
    try {
      const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(part.map((message) => toResend(from, message))),
        signal: AbortSignal.timeout(20_000),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        const error = typeof body?.message === 'string' ? body.message : `Resend returned ${response.status}`
        console.error('Batch email send failed:', error)
        part.forEach(() => results.push({ sent: false, reason: 'failed', error }))
        continue
      }
      const ids: unknown[] = Array.isArray(body?.data) ? body.data : []
      part.forEach((_, j) => {
        const id = (ids[j] as { id?: unknown } | undefined)?.id
        results.push({ sent: true, id: typeof id === 'string' ? id : null })
      })
    } catch (error) {
      console.error('Batch email send failed:', error)
      const message = error instanceof Error ? error.message : String(error)
      part.forEach(() => results.push({ sent: false, reason: 'failed', error: message }))
    }
  }
  return results
}
