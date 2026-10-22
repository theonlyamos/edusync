import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import { env, requireEnv } from '@/lib/env';
import {
  CREDIT_PRICE_CENTS,
  isSchoolManagerRole,
  MAX_SCHOOL_PURCHASE_CREDITS,
  MIN_SCHOOL_PURCHASE_CREDITS,
  parsePurchaseCredits,
} from '@/lib/school-billing';
import { getSchoolBillingDetails, getSchoolBillingMembership } from '@/lib/school-billing.server';

function getStripe(): Stripe {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: '2025-08-27.basil' });
}

async function requireSchoolManager() {
  const session = await getServerSession();
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const membership = await getSchoolBillingMembership(createServerSupabase(), session.user.id);
  if (!membership || !isSchoolManagerRole(membership.role)) {
    return { error: NextResponse.json({ error: 'Only school owners and admins can manage school credits' }, { status: 403 }) };
  }
  return { session, membership };
}

/** The school's balance, authoring allowance, usage this month and recent credit history. */
export async function GET() {
  try {
    const auth = await requireSchoolManager();
    if ('error' in auth) return auth.error;
    const details = await getSchoolBillingDetails(auth.membership.school.id);
    if (!details) return NextResponse.json({ error: 'School not found' }, { status: 404 });
    return NextResponse.json({ school: { id: auth.membership.school.id, name: auth.membership.school.name }, ...details });
  } catch (error) {
    console.error('Error in GET /api/schools/current/credits:', error);
    return NextResponse.json({ error: 'Failed to load school credits' }, { status: 500 });
  }
}

/** Starts a Stripe checkout that adds credits to the school's pool. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSchoolManager();
    if ('error' in auth) return auth.error;

    const body = await request.json().catch(() => null);
    const credits = parsePurchaseCredits(body?.credits);
    if (!credits) {
      return NextResponse.json(
        { error: `Choose between ${MIN_SCHOOL_PURCHASE_CREDITS} and ${MAX_SCHOOL_PURCHASE_CREDITS} credits` },
        { status: 400 },
      );
    }

    const { school } = auth.membership;
    const base = env().NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const checkout = await getStripe().checkout.sessions.create({
      customer_email: auth.session.user.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product: requireEnv('STRIPE_CREDIT_PRODUCT_ID'),
            unit_amount: CREDIT_PRICE_CENTS,
          },
          quantity: credits,
        },
      ],
      mode: 'payment',
      success_url: `${base}/school/billing?purchase=success`,
      cancel_url: `${base}/school/billing`,
      metadata: {
        kind: 'school_credits',
        organizationId: school.id,
        userId: auth.session.user.id,
        credits: String(credits),
      },
      payment_intent_data: {
        metadata: { kind: 'school_credits', organizationId: school.id },
      },
    });

    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error('Error in POST /api/schools/current/credits:', error);
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
  }
}
