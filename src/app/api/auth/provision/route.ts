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

        const { data: existing, error: lookupError } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('id', id)
            .maybeSingle()

        if (lookupError) throw lookupError
        const profileFields = 'id, email, name, image, role'
        let user

        if (!existing) {
            const { data, error: insertError } = await supabaseAdmin
                .from('users')
                .upsert({ id, email, name, image, role: 'student', credits: 60 }, { onConflict: 'id', ignoreDuplicates: true })
                .select(profileFields)
                .maybeSingle()
            if (insertError) throw insertError
            user = data

            if (user) {
                await initializeUserCredits(id)
            } else {
                // Another tab may have provisioned this account after our lookup.
                const { data: profile, error } = await supabaseAdmin.from('users').select(profileFields).eq('id', id).single()
                if (error) throw error
                user = profile
            }
        } else {
            const { data, error: updateError } = await supabaseAdmin
                .from('users')
                .update({ email, name, image })
                .eq('id', id)
                .select(profileFields)
                .single()
            if (updateError) throw updateError
            user = data
        }

        const result = NextResponse.json({ ok: true, user })
        response.cookies.getAll().forEach(cookie => result.cookies.set(cookie))
        return result
    } catch (error) {
        return NextResponse.json({ error: (error as any)?.message ?? 'Server error' }, { status: 500 })
    }
}


