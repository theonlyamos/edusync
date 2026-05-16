import { NextRequest, NextResponse } from 'next/server'
import { WebhookReceiver } from 'livekit-server-sdk'

/**
 * Optional: verify LiveKit Cloud webhooks. Extend to persist attendance / event status.
 * Configure LIVEKIT_API_KEY as the webhook signing key from LiveKit dashboard if different.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.LIVEKIT_WEBHOOK_SECRET || process.env.LIVEKIT_API_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 501 })
  }

  const body = await request.text()
  const authHeader = request.headers.get('authorization') ?? undefined
  const apiKey = process.env.LIVEKIT_API_KEY || ''

  try {
    const receiver = new WebhookReceiver(apiKey, secret)
    await receiver.receive(body, authHeader)
    // const event = ... parse if needed
    return NextResponse.json({ received: true })
  } catch (e) {
    console.error('[livekit webhook]', e)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
}
