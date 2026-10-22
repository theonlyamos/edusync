import { NextResponse } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { homeworkAiLockForUser } from '@/lib/homework/ai-policy-server';

export const dynamic = 'force-dynamic';

/** Which homework, if any, is pausing the signed-in student's AI tools. */
export async function GET() {
  const supabase = await createSSRUserSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ lock: await homeworkAiLockForUser(user.id) });
  } catch (error) {
    console.error('[HOMEWORK_LOCK_GET]', error);
    return NextResponse.json({ error: 'Could not check homework status' }, { status: 503 });
  }
}
