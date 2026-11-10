import { after, NextRequest, NextResponse } from 'next/server'
import { createSSRUserSupabase, createServerSupabase } from '@/lib/supabase.server'
import { getAuthContext } from '@/lib/get-auth-context'
import { sendKeyEvent } from '@/lib/webhooks.server'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const authContext = getAuthContext(request);
        
        if (!authContext) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json().catch(() => ({}))
        const { id } = await params

        const updates: any = {}
        if (typeof body.topic === 'string') updates.topic = body.topic
        if (typeof body.status === 'string') updates.status = body.status
        if (typeof body.session_id === 'string') updates.session_id = body.session_id
        if (typeof body.session_handle === 'string') updates.session_handle = body.session_handle
        if (body.ended === true) updates.ended_at = new Date().toISOString()

        // createClient vs createServerClient unions break `.from()` inference; normalize to one client type.
        const supabase = (
            authContext.authType === 'apiKey'
                ? createServerSupabase()
                : await createSSRUserSupabase()
        ) as SupabaseClient

        const { data: existing, error: fetchErr } = await supabase
            .from('learning_sessions')
            .select('id, user_id, api_key_id, topic, created_at, ended_at')
            .eq('id', id)
            .maybeSingle()

        if (fetchErr || !existing) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        if (existing.user_id !== authContext.userId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // An embedded session can be ended by two requests at once (the voice
        // stopping and the page disconnecting). Only the one that actually moves
        // it from running to ended tells the key owner's server.
        let endedNow = false
        if (updates.ended_at && existing.api_key_id && !existing.ended_at) {
            const { data: claimed, error: claimError } = await supabase
                .from('learning_sessions')
                .update(updates)
                .eq('id', id)
                .is('ended_at', null)
                .select('id')
            if (claimError) {
                return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
            }
            endedNow = (claimed?.length ?? 0) > 0
        }

        if (!endedNow) {
            const { error } = await supabase
                .from('learning_sessions')
                .update(updates)
                .eq('id', id)

            if (error) {
                return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
            }
        }

        if (endedNow) {
            const event = {
                sessionId: existing.id,
                topic: updates.topic ?? existing.topic ?? null,
                startedAt: existing.created_at,
                endedAt: updates.ended_at,
                durationSeconds: Math.max(0, Math.round((Date.parse(updates.ended_at) - Date.parse(existing.created_at)) / 1000)),
            }
            after(() => sendKeyEvent(existing.api_key_id, 'session.ended', event))
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to update session', details: error.message }, { status: 500 })
    }
}


