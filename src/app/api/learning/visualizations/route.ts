import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase.server'
import { getServerSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession()
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { session_id, library, explanation, code, panel_dimensions, data } = await request.json()
        if (!session_id || !library || !explanation || !code) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const supabase = createServerSupabase()

        // Verify ownership of session
        const { data: sess, error: sessErr } = await supabase
            .from('learning_sessions')
            .select('id, user_id')
            .eq('id', session_id)
            .maybeSingle()

        if (sessErr || !sess) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        }
        if (sess.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const insertPayload: any = {
            session_id,
            library,
            explanation,
            code,
            panel_dimensions: panel_dimensions ?? null,
            data: data ?? null,
        }

        const { data: inserted, error } = await supabase
            .from('learning_visualizations')
            .insert([insertPayload])
            .select('id')
            .single()

        if (error) {
            return NextResponse.json({ error: 'Failed to save visualization' }, { status: 500 })
        }

        return NextResponse.json({ id: inserted.id })
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to save visualization', details: error.message }, { status: 500 })
    }
}


