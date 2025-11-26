import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase.server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'insyteai'

async function ensureBucket() {
    try {
        const admin = createServerSupabase()
        const { data, error } = await admin.storage.getBucket(BUCKET)
        if (error || !data) {
            await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 1024 * 1024 * 200 })
        }
    } catch { }
}

async function assertSessionOwnership(userId: string, sessionId: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data, error } = await supabase
        .from('learning_sessions')
        .select('id, user_id')
        .eq('id', sessionId)
        .maybeSingle()
    if (error || !data) return false
    return data.user_id === userId
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authContext = getAuthContext(request)
    const userId = authContext?.userId
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: sessionId } = await params
    const owns = await assertSessionOwnership(userId, sessionId)
    if (!owns) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(request.url)
    const type = (url.searchParams.get('type') || 'user').toString()
    const index = (url.searchParams.get('index') || '000001').toString()
    if (!['user', 'ai'].includes(type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

    try {
        const form = await request.formData()
        const blob = form.get('part') as Blob | null
        if (!blob) return NextResponse.json({ error: 'Missing part' }, { status: 400 })

        await ensureBucket()
        const admin = createServerSupabase()
        const prefix = `${userId}/${sessionId}`
        const ext = (blob as any).type?.includes('ogg') ? 'ogg' : 'webm'
        const key = `${prefix}/${type}.part-${index}.${ext}`
        const { error } = await admin.storage.from(BUCKET).upload(key, blob, { upsert: true, contentType: (blob as any).type || 'audio/webm' })
        if (error) throw error
        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('Failed to upload part:', e)
        return NextResponse.json({ error: e.message || 'Failed to upload part' }, { status: 500 })
    }
}


