import { NextRequest, NextResponse } from 'next/server'
import { hasEnoughCredits } from '@/lib/credits'
import { getAuthContext } from '@/lib/get-auth-context'
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const authContext = getAuthContext(request)
    const userId = authContext?.userId
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check if user has enough credits to start a session (at least 1 credit for 1 minute)
    const hasCredits = await hasEnoughCredits(userId, 1)
    if (!hasCredits) {
      return NextResponse.json({
        error: 'Insufficient credits. You need at least 1 credit to start an AI session.',
        code: 'INSUFFICIENT_CREDITS'
      }, { status: 402 }) // 402 Payment Required
    }



    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: user } = await supabase
      .from('users')
      .select('credits')
      .eq('id', userId)
      .single();

    const credits = user?.credits;

    if (!credits || credits.credits < 1) {
      return NextResponse.json(
        {
          error: 'Insufficient credits. The API key owner needs at least 1 credit to start a session.',
          code: 'INSUFFICIENT_CREDITS',
        },
        { status: 402 }
      );
    }

    const { session_id, session_handle, topic } = await request.json().catch(() => ({}))

    const originHeader = request.headers.get('origin') || request.headers.get('referer');
    let domain: string | null = null;
    if (originHeader) {
      try {
        domain = new URL(originHeader).hostname;
      } catch {
        domain = null;
      }
    }
    if (!domain) {
      domain = request.nextUrl.hostname ?? null;
    }

    const forwardedFor = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || null;
    const userAgent = request.headers.get('user-agent') || null;

    const insertPayload: any = {
      user_id: userId,
      status: 'active',
      topic: topic || null,
      session_id: session_id || null,
      session_handle: session_handle || null,
      domain,
      ip_address: ipAddress,
      user_agent: userAgent,
    };

    if (authContext.authType === 'apiKey') {
      insertPayload.api_key_id = authContext.apiKeyId,
        insertPayload.is_embedded = true
    }

    const { data: session, error } = await supabase
      .from('learning_sessions')
      .insert([insertPayload])
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create embedded session:', error);
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: session.id,
      message: 'Embedded session created successfully. Credits will be deducted from your account.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to create session', details: error.message }, { status: 500 })
  }
}


