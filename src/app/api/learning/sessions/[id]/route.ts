import { NextRequest, NextResponse } from 'next/server'
import { createSSRUserSupabase } from '@/lib/supabase.server'
import { getServerSession } from '@/lib/auth'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession()
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json().catch(() => ({}))
        const supabase = await createSSRUserSupabase()

        const { id } = await params

        const updates: any = {}
        if (typeof body.topic === 'string') updates.topic = body.topic
        if (typeof body.status === 'string') updates.status = body.status
        if (typeof body.session_id === 'string') updates.session_id = body.session_id
        if (typeof body.session_handle === 'string') updates.session_handle = body.session_handle
        if (body.ended === true) updates.ended_at = new Date().toISOString()

        const { data: existing, error: fetchErr } = await supabase
            .from('learning_sessions')
            .select('id, user_id')
            .eq('id', id)
            .maybeSingle()

        if (fetchErr || !existing) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        if (existing.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { error } = await supabase
            .from('learning_sessions')
            .update(updates)
            .eq('id', id)

        if (error) {
            return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to update session', details: error.message }, { status: 500 })
    }
}


