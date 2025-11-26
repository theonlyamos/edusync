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

    const admin = createServerSupabase()
    const prefix = `${userId}/${sessionId}`

    const concatInterleaved = async () => {
        const { data: list, error: listErr } = await admin.storage.from(BUCKET).list(prefix, { limit: 10000 })
        if (listErr) throw listErr

        const aiParts = (list || []).filter(f => f.name.startsWith('ai.part-') && (f.name.endsWith('.webm') || f.name.endsWith('.ogg')))
        const userParts = (list || []).filter(f => f.name.startsWith('user.part-') && (f.name.endsWith('.webm') || f.name.endsWith('.ogg')))

        if (aiParts.length === 0 && userParts.length === 0) return

        aiParts.sort((a, b) => a.name.localeCompare(b.name))
        userParts.sort((a, b) => a.name.localeCompare(b.name))

        const indexFromName = (name: string) => {
            const m = name.match(/\.part-(\d{6})\.(?:webm|ogg)$/)
            return m ? m[1] : '000000'
        }

        const aiMap = new Map<string, string>()
        for (const p of aiParts) aiMap.set(indexFromName(p.name), p.name)

        const userMap = new Map<string, string>()
        for (const p of userParts) userMap.set(indexFromName(p.name), p.name)

        const indexSet = new Set<string>()
        aiMap.forEach((_, k) => indexSet.add(k))
        userMap.forEach((_, k) => indexSet.add(k))
        const allIndexes = Array.from(indexSet)
        allIndexes.sort()

        const chunks: Uint8Array[] = []
        let useWebm = false
        for (const idx of allIndexes) {
            const aiName = aiMap.get(idx)
            if (aiName) {
                if (aiName.endsWith('.webm')) useWebm = true
                const { data, error } = await admin.storage.from(BUCKET).download(`${prefix}/${aiName}`)
                if (error) throw error
                const buf = new Uint8Array(await (data as any).arrayBuffer())
                chunks.push(buf)
            }
            const userName = userMap.get(idx)
            if (userName) {
                if (userName.endsWith('.webm')) useWebm = true
                const { data, error } = await admin.storage.from(BUCKET).download(`${prefix}/${userName}`)
                if (error) throw error
                const buf = new Uint8Array(await (data as any).arrayBuffer())
                chunks.push(buf)
            }
        }

        if (chunks.length === 0) return

        const totalLen = chunks.reduce((acc, b) => acc + b.length, 0)
        const merged = new Uint8Array(totalLen)
        let offset = 0
        for (const c of chunks) { merged.set(c, offset); offset += c.length }

        const ext = useWebm ? 'webm' : 'ogg'
        const blob = new Blob([merged], { type: useWebm ? 'audio/webm' : 'audio/ogg' })
        const key = `${prefix}/conversation.${ext}`
        const { error: upErr } = await admin.storage.from(BUCKET).upload(key, blob, { upsert: true, contentType: blob.type })
        if (upErr) throw upErr
    }

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
        await concatInterleaved()
        await Promise.all([concat('user'), concat('ai')])
        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('Failed to finalize recordings:', e)
        return NextResponse.json({ error: e.message || 'Failed to finalize' }, { status: 500 })
    }
}


