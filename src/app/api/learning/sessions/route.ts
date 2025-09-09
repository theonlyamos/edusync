import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase.server'
import { getServerSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession()
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { session_id, session_handle, topic } = await request.json().catch(() => ({}))

        const supabase = createServerSupabase()

        const insertPayload: any = {
            user_id: session.user.id,
            status: 'active',
            topic: topic ?? null,
            session_id: session_id ?? null,
            session_handle: session_handle ?? null,
        }

        const { data, error } = await supabase
            .from('learning_sessions')
            .insert([insertPayload])
            .select('id')
            .single()

        if (error) {
            return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
        }

        return NextResponse.json({ id: data.id })
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to create session', details: error.message }, { status: 500 })
    }
}


