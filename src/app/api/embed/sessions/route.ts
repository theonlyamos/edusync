import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/get-auth-context';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const authContext = getAuthContext(request);

    if (!authContext || !authContext.apiKeyId) {
      return NextResponse.json(
        { error: 'API key authentication required' },
        { status: 401 }
      );
    }

    const { userId, apiKeyId } = authContext;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: credits } = await supabase
      .from('user_credits')
      .select('credits')
      .eq('user_id', userId)
      .maybeSingle();

    if (!credits || credits.credits < 1) {
      return NextResponse.json(
        {
          error: 'Insufficient credits. The API key owner needs at least 1 credit to start a session.',
          code: 'INSUFFICIENT_CREDITS',
        },
        { status: 402 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { topic, metadata } = body;

    const insertPayload: any = {
      user_id: userId,
      api_key_id: apiKeyId,
      is_embedded: true,
      status: 'active',
      topic: topic || null,
      session_id: null,
      session_handle: null,
    };

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
      sessionId: session.id,
      message: 'Embedded session created successfully. Credits will be deducted from your account.',
    });
  } catch (error: any) {
    console.error('Failed to create embedded session:', error);
    return NextResponse.json(
      { error: 'Failed to create session', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authContext = getAuthContext(request);

    if (!authContext || !authContext.apiKeyId) {
      return NextResponse.json(
        { error: 'API key authentication required' },
        { status: 401 }
      );
    }

    const { apiKeyId } = authContext;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;

    const { data: sessions, error } = await supabase
      .from('learning_sessions')
      .select('id, created_at, topic, status, ended_at')
      .eq('api_key_id', apiKeyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch sessions' },
        { status: 500 }
      );
    }

    return NextResponse.json({ sessions });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch sessions', details: error.message },
      { status: 500 }
    );
  }
}

