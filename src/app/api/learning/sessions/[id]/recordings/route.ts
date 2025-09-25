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

    await ensureBucket()
    const admin = createServerSupabase()

    try {
        const form = await request.formData()
        const userBlob = form.get('user') as Blob | null
        const aiBlob = form.get('ai') as Blob | null
        const durationMs = Number(form.get('durationMs') || 0)

        const prefix = `${session.user.id}/${sessionId}`
        const uploads: any = {}

        const tasks: Promise<void>[] = []
        if (userBlob) {
            const key = `${prefix}/user.${(userBlob as any).type?.includes('ogg') ? 'ogg' : 'webm'}`
            tasks.push((async () => {
                const { error } = await admin.storage.from(BUCKET).upload(key, userBlob, { upsert: true, contentType: (userBlob as any).type || 'audio/webm' })
                if (error) throw error
                uploads.userKey = key
            })())
        }
        if (aiBlob) {
            const key = `${prefix}/ai.${(aiBlob as any).type?.includes('ogg') ? 'ogg' : 'webm'}`
            tasks.push((async () => {
                const { error } = await admin.storage.from(BUCKET).upload(key, aiBlob, { upsert: true, contentType: (aiBlob as any).type || 'audio/webm' })
                if (error) throw error
                uploads.aiKey = key
            })())
        }

        if (tasks.length > 0) await Promise.all(tasks)

        const meta = JSON.stringify({ durationMs })
        const { error: metaErr } = await admin.storage.from(BUCKET).upload(`${prefix}/meta.json`, new Blob([meta], { type: 'application/json' }), { upsert: true, contentType: 'application/json' })
        if (metaErr) throw metaErr

        return NextResponse.json({ success: true, ...uploads })
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Failed to upload recordings' }, { status: 500 })
    }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: sessionId } = await params
    const owns = await assertSessionOwnership(session.user.id, sessionId)
    if (!owns) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await ensureBucket()
    const admin = createServerSupabase()

    try {
        const prefix = `${session.user.id}/${sessionId}`
        const toSigned = async (key: string) => {
            const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(key, 60 * 60)
            if (error) return null
            return data?.signedUrl || null
        }

        const [userUrl, aiUrl, conversationUrl] = await Promise.all([
            toSigned(`${prefix}/user.webm`).then(u => u || toSigned(`${prefix}/user.ogg`)),
            toSigned(`${prefix}/ai.webm`).then(u => u || toSigned(`${prefix}/ai.ogg`)),
            toSigned(`${prefix}/conversation.webm`).then(u => u || toSigned(`${prefix}/conversation.ogg`)),
        ])

        // Also return any part URLs if finalize hasn't run yet
        const listParts = async (kind: 'user' | 'ai') => {
            const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 })
            if (error || !data) return [] as string[]
            const matches = data.filter(f => f.name.startsWith(`${kind}.part-`) && (f.name.endsWith('.webm') || f.name.endsWith('.ogg')))
            matches.sort((a, b) => a.name.localeCompare(b.name))
            const urls: string[] = []
            for (const f of matches) {
                const signed = await toSigned(`${prefix}/${f.name}`)
                if (signed) urls.push(signed)
            }
            return urls
        }

        const [userParts, aiParts] = await Promise.all([listParts('user'), listParts('ai')])

        let durationMs = 0
        try {
            const { data, error } = await admin.storage.from(BUCKET).download(`${prefix}/meta.json`)
            if (!error && data) {
                const text = await (data as any).text()
                const meta = JSON.parse(text)
                durationMs = Number(meta.durationMs || 0)
            }
        } catch { }

        return NextResponse.json({ userUrl, aiUrl, conversationUrl, userParts, aiParts, durationMs })
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Failed to fetch recordings' }, { status: 500 })
    }
}


