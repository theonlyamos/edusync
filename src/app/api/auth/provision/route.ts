import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, type CookieAdapter } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server'
import { initializeUserCredits } from '@/lib/credits'
import { addSecurityHeaders, configureCORS } from '@/middleware/security';

export async function POST(request: NextRequest) {
    try {
        let response = NextResponse.next({
            request: {
                headers: request.headers,
            },
        });

        // Add security headers to all responses
        response = addSecurityHeaders(response);

        // Configure CORS
        response = configureCORS(request, response);
        const adapter: CookieAdapter = {
            getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
            setAll: (cookiesToSet) => {
                cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            },
        };
        const session = await getServerSession(adapter)
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
                .insert({ id, email, name, image, role: 'student', credits: 60 })
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


