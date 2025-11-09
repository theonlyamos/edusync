import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/get-auth-context';
import { deductCreditsFromApiKey } from '@/lib/api-key-auth';
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

    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: session } = await supabase
      .from('learning_sessions')
      .select('id, api_key_id, user_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (session.api_key_id !== apiKeyId) {
      return NextResponse.json(
        { error: 'This session does not belong to your API key' },
        { status: 403 }
      );
    }

    const result = await deductCreditsFromApiKey(apiKeyId, userId, 1);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to deduct credits',
          remainingCredits: result.remainingCredits,
        },
        { status: result.error === 'Insufficient credits' ? 402 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      remainingCredits: result.remainingCredits,
      message: 'Credit deducted successfully',
    });
  } catch (error: any) {
    console.error('Failed to deduct credit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to deduct credit', details: error.message },
      { status: 500 }
    );
  }
}

