import { NextRequest, NextResponse } from 'next/server'
import { createSSRUserSupabase } from '@/lib/supabase.server'
import { getServerSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const supabase = await createSSRUserSupabase()
  const session = await getServerSession()

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit') as string) : 50

  const { data: sessions, error } = await supabase
    .from('learning_sessions')
    .select('id, created_at, topic')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Failed to fetch learning sessions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch learning sessions', details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json(sessions)
}
