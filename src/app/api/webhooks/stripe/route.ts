import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { addCredits } from '@/lib/credits'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-08-27.basil',
})

export async function POST(request: NextRequest) {
    const body = await request.text()
    const headersList = await headers()
    const signature = headersList.get('stripe-signature')!

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

                    console.log(`Successfully added ${creditsToAdd} credits to user ${userId}`)
                }
            }
        }

        return NextResponse.json({ received: true })
    } catch (error: any) {
        console.error('Webhook processing error:', error)
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
    }
}
