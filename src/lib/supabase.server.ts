import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { CookieAdapter } from '@/lib/auth'

export function createServerSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    if (!url || !serviceRole) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }
    return createClient(url, serviceRole)
}

export async function createSSRUserSupabase(adapter?: CookieAdapter) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
    if (!url || !anonKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
    }

    const cookieStore = adapter ? null : await cookies()

    return createServerClient(
        url,
        anonKey,
        {
            cookies: adapter
                ? {
                    getAll() {
                        return adapter.getAll()
                    },
                    setAll(cookiesToSet) {
                        adapter.setAll(cookiesToSet)
                    },
                }
                : {
                    getAll() {
                        return (cookieStore as any).getAll().map(({ name, value }: any) => ({ name, value }))
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }: any) =>
                                (cookieStore as any).set({ name, value, ...options })
                            )
                        } catch { }
                    },
                },
        }
    )
}
