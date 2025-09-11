import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase.server'
import { initializeUserCredits } from '@/lib/credits'

export async function POST(request: Request) {
    try {
        const session = await getServerSession()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { id, email, name, image } = body || {}

        if (!id || id !== session.user.id) {
            return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
        }

        const supabaseAdmin = createServerSupabase()

        const { data: existing } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('id', id)
            .maybeSingle()

        if (!existing) {
            const { error: insertError } = await supabaseAdmin
                .from('users')
                .insert({ id, email, name, image, role: 'student', credits: 100 })
            if (insertError) throw insertError

            // Initialize credits for new user
            await initializeUserCredits(id)
        } else {
            await supabaseAdmin
                .from('users')
                .update({ email, name, image })
                .eq('id', id)
        }

        return NextResponse.json({ ok: true })
    } catch (error) {
        return NextResponse.json({ error: (error as any)?.message ?? 'Server error' }, { status: 500 })
    }
}


