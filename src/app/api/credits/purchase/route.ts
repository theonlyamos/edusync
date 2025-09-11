import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-08-27.basil',
})

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession()
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { credits } = await request.json()

        if (!credits || credits <= 0) {
            return NextResponse.json({ error: 'Invalid credit amount' }, { status: 400 })
        }

        // Calculate price in cents (assuming $0.10 per credit)
        const priceInCents = credits * 10 // 10 cents per credit

        // Create Stripe checkout session
        const checkoutSession = await stripe.checkout.sessions.create({
            customer_email: session.user.email,
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product: process.env.STRIPE_CREDIT_PRODUCT_ID!,
                        unit_amount: priceInCents,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/credits/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/credits`,
            metadata: {
                userId: session.user.id,
                credits: credits.toString(),
            },
        })

        return NextResponse.json({ url: checkoutSession.url })
    } catch (error: any) {
        console.error('Credit purchase error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// Alternative endpoint using your predefined price ID
export async function PUT(request: NextRequest) {
    try {
        const session = await getServerSession()
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { quantity = 1 } = await request.json()

        // Create Stripe checkout session using your predefined price ID
        const checkoutSession = await stripe.checkout.sessions.create({
            customer_email: session.user.email,
            line_items: [
                {
                    price: process.env.STRIPE_CREDIT_PRICE_ID!,
                    quantity: quantity,
                },
            ],
            mode: 'payment',
            success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/credits/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/credits`,
            metadata: {
                userId: session.user.id,
                quantity: quantity.toString(),
            },
        })

        return NextResponse.json({ url: checkoutSession.url })
    } catch (error: any) {
        console.error('Credit purchase error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
