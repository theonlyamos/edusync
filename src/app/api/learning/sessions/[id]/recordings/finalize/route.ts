import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createSSRUserSupabase } from '@/lib/supabase.server'
import { getServerSession } from '@/lib/auth'

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
    const supabase = await createSSRUserSupabase()
    const { data, error } = await supabase
        .from('learning_sessions')
        .select('id, user_id')
        .eq('id', sessionId)
        .maybeSingle()
    if (error || !data) return false
    return data.user_id === userId
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: sessionId } = await params
    const owns = await assertSessionOwnership(session.user.id, sessionId)
    if (!owns) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const admin = createServerSupabase()
    const prefix = `${session.user.id}/${sessionId}`

    const concat = async (kind: 'user' | 'ai') => {
        const { data: list, error: listErr } = await admin.storage.from(BUCKET).list(prefix, { limit: 10000 })
        if (listErr) throw listErr
        const parts = (list || []).filter(f => f.name.startsWith(`${kind}.part-`) && (f.name.endsWith('.webm') || f.name.endsWith('.ogg')))
        parts.sort((a, b) => a.name.localeCompare(b.name))
        if (parts.length === 0) return
        const ext = parts[0].name.endsWith('.ogg') ? 'ogg' : 'webm'
        const key = `${prefix}/${kind}.${ext}`
        const chunks: Uint8Array[] = []
        for (const p of parts) {
            const { data, error } = await admin.storage.from(BUCKET).download(`${prefix}/${p.name}`)
            if (error) throw error
            const buf = new Uint8Array(await (data as any).arrayBuffer())
            chunks.push(buf)
        }
        const totalLen = chunks.reduce((acc, b) => acc + b.length, 0)
        const merged = new Uint8Array(totalLen)
        let offset = 0
        for (const c of chunks) { merged.set(c, offset); offset += c.length }
        const blob = new Blob([merged], { type: ext === 'ogg' ? 'audio/ogg' : 'audio/webm' })
        const { error: upErr } = await admin.storage.from(BUCKET).upload(key, blob, { upsert: true, contentType: blob.type })
        if (upErr) throw upErr
        // Cleanup parts
        for (const p of parts) {
            await admin.storage.from(BUCKET).remove([`${prefix}/${p.name}`])
        }
    }

    try {
        await ensureBucket()
        await Promise.all([concat('user'), concat('ai')])
        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('Failed to finalize recordings:', e)
        return NextResponse.json({ error: e.message || 'Failed to finalize' }, { status: 500 })
    }
}


