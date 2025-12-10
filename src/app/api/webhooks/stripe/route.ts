import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { addCredits } from '@/lib/credits'

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
        console.log('Stripe webhook received', { bodyLength: body.length })
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
                    // Idempotency: avoid processing the same event twice
                    // Use the Stripe event id as unique key
                    const eventId = event.id
                    const processed = await hasProcessedEvent(eventId)
                    if (processed) {
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
                        return NextResponse.json({ error: 'Failed to add credits' }, { status: 500 })
                    }
                    await markEventProcessed(eventId)
                    console.log(`Processed Stripe checkout: added ${creditsToAdd} credits to user ${userId}`)
                }
            }
        }

        return NextResponse.json({ received: true })
    } catch (error: any) {
        console.error('Webhook processing error:', error)
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
    }
}

// Naive in-memory idempotency store; replace with Redis/DB in production
const processedEvents = new Set<string>()
async function hasProcessedEvent(id: string) {
    return processedEvents.has(id)
}
async function markEventProcessed(id: string) {
    processedEvents.add(id)
}
