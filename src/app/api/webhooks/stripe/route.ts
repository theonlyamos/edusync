import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { addCredits } from '@/lib/credits'
import { createServerSupabase } from '@/lib/supabase.server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-08-27.basil',
})

// Disable body parsing for webhook signature verification
// export const config = {
//    api: {
//        bodyParser: false,
//    },
// }


export async function POST(request: NextRequest) {
    let body: string
    let signature: string

    try {
        // Get raw body as text
        body = await request.text()

        // Get signature from headers
        const headersList = await headers()
        signature = headersList.get('stripe-signature') || ''

        if (!signature) {
            console.error('No Stripe signature found in headers')
            return NextResponse.json({ error: 'No signature found' }, { status: 400 })
        }

        // Minimal logging; avoid leaking signature
        console.warn('Stripe webhook received', { bodyLength: body.length })
    } catch (error) {
        console.error('Error parsing webhook request:', error)
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    let event: Stripe.Event

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        )
    } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`)
        return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 })
    }

    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session
            const { userId, credits, quantity } = session.metadata!

            if (userId) {
                let creditsToAdd = 0

                if (credits) {
                    // Custom credit amount
                    creditsToAdd = parseInt(credits)
                } else if (quantity) {
                    // Using predefined price - need to determine credits from price
                    // You'll need to set this based on your Stripe price configuration
                    const qty = parseInt(quantity)
                    creditsToAdd = qty * 100 // Assuming 100 credits per unit in your price
                }

                if (creditsToAdd > 0) {
                    // Idempotency: claim the event id in the DB before granting credits.
                    // A unique-violation means another delivery already handled it.
                    const claimed = await claimEvent(event.id, event.type)
                    if (!claimed) {
                        return NextResponse.json({ received: true, duplicate: true })
                    }
                    const result = await addCredits(
                        userId,
                        creditsToAdd,
                        `Purchased ${creditsToAdd} credits`,
                        'purchase',
                        session.payment_intent as string
                    )

                    if (!result.success) {
                        console.error('Failed to add credits:', result.error)
                        // Release the claim so Stripe's retry can re-attempt the grant.
                        await releaseEvent(event.id)
                        return NextResponse.json({ error: 'Failed to add credits' }, { status: 500 })
                    }
                    console.warn(`Processed Stripe checkout: added ${creditsToAdd} credits to user ${userId}`)
                }
            }
        }

        return NextResponse.json({ received: true })
    } catch (error: any) {
        console.error('Webhook processing error:', error)
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
    }
}

// Durable idempotency backed by stripe_webhook_events (migration 0032).
// Returns true if this delivery won the claim; false if already processed.
async function claimEvent(id: string, type: string): Promise<boolean> {
    const supabase = createServerSupabase()
    const { error } = await supabase
        .from('stripe_webhook_events')
        .insert({ event_id: id, event_type: type })
    if (!error) return true
    // 23505 = unique violation: event already claimed by a previous delivery.
    if (error.code === '23505') return false
    // Unexpected DB error: fail closed (treat as duplicate) and let Stripe retry.
    console.error('Failed to claim Stripe event for idempotency:', error)
    return false
}

async function releaseEvent(id: string): Promise<void> {
    const supabase = createServerSupabase()
    const { error } = await supabase
        .from('stripe_webhook_events')
        .delete()
        .eq('event_id', id)
    if (error) {
        console.error('Failed to release Stripe event claim:', error)
    }
}
