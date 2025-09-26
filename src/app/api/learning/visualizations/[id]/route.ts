import { NextRequest, NextResponse } from 'next/server'
import { createSSRUserSupabase } from '@/lib/supabase.server'
import { getServerSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession()
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params
        const payload = await request.json()

        const supabase = await createSSRUserSupabase()

        const { data: viz, error: vizErr } = await supabase
            .from('learning_visualizations')
            .select('id, session_id')
            .eq('id', id)
            .maybeSingle()

        if (vizErr || !viz) {
            return NextResponse.json({ error: 'Visualization not found' }, { status: 404 })
        }

        const { data: sess, error: sessErr } = await supabase
            .from('learning_sessions')
            .select('id, user_id')
            .eq('id', viz.session_id)
            .maybeSingle()

        if (sessErr || !sess || sess.user_id !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const updatePayload: any = {}
        if (typeof payload.code === 'string') updatePayload.code = payload.code
        if (typeof payload.library === 'string') updatePayload.library = payload.library
        if (typeof payload.explanation === 'string' || payload.explanation === null) updatePayload.explanation = payload.explanation
        if (payload.panel_dimensions !== undefined) updatePayload.panel_dimensions = payload.panel_dimensions

        const { error } = await supabase
            .from('learning_visualizations')
            .update(updatePayload)
            .eq('id', id)

        if (error) {
            return NextResponse.json({ error: 'Failed to update visualization' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to update visualization', details: error.message }, { status: 500 })
    }
}


