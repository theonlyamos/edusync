import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth';
import { markNotificationsRead, notificationFeed } from '@/lib/notifications.server';
import { createServerSupabase } from '@/lib/supabase.server';

/** The signed-in person's latest notifications and how many are unread. */
export async function GET() {
  const session = await getServerSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const feed = await notificationFeed(createServerSupabase(), session.user.id);
    return NextResponse.json(feed, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[GET /api/notifications]', error);
    return NextResponse.json({ error: 'Could not load notifications' }, { status: 500 });
  }
}

const readSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }),
]);

/** Marks notifications read: { all: true } or { ids: [...] }. Returns the fresh feed. */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = readSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Say which notifications to mark read' }, { status: 400 });
  try {
    const supabase = createServerSupabase();
    await markNotificationsRead(supabase, session.user.id, 'all' in parsed.data ? 'all' : parsed.data.ids);
    return NextResponse.json(await notificationFeed(supabase, session.user.id));
  } catch (error) {
    console.error('[POST /api/notifications]', error);
    return NextResponse.json({ error: 'Could not update notifications' }, { status: 500 });
  }
}
