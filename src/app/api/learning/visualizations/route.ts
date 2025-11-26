import { NextRequest, NextResponse } from 'next/server'
import { createSSRUserSupabase } from '@/lib/supabase.server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
    try {
        const authContext = getAuthContext(request)
        const userId = authContext?.userId
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { searchParams } = new URL(request.url)
        const sessionId = searchParams.get('session_id')
        if (!sessionId) {
            return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
        }

        const supabase = await createSSRUserSupabase()

        const { data, error } = await supabase
            .from('learning_visualizations')
            .select('id, session_id, created_at, library, explanation, code, panel_dimensions, description, sequence')
            .eq('session_id', sessionId)
            .order('sequence', { ascending: true })
            .order('created_at', { ascending: true })

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch visualizations' }, { status: 500 })
        }

        return NextResponse.json({ items: data ?? [] })
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to fetch visualizations', details: error.message }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const authContext = getAuthContext(request)
        const userId = authContext?.userId
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { session_id, library, explanation, code, panel_dimensions, description, data } = await request.json()
        if (!session_id || !library || !explanation || !code) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Verify ownership of session
        const { data: sess, error: sessErr } = await supabase
            .from('learning_sessions')
            .select('id, user_id')
            .eq('id', session_id)
            .maybeSingle()

        if (sessErr || !sess) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        }
        if (sess.user_id !== userId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const insertPayload: any = {
            session_id,
            library,
            explanation,
            code,
            panel_dimensions: panel_dimensions ?? null,
            data: data ?? null,
            description: description ?? null,
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


