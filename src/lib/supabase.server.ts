import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { CookieAdapter } from '@/lib/auth'
import { env } from '@/lib/env'
import { createAdminSupabase } from '@/lib/supabase-admin'

export function createServerSupabase() {
    return createAdminSupabase()
}

export async function createSSRUserSupabase(adapter?: CookieAdapter) {
    const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env()

    const cookieStore = adapter ? null : await cookies()

    return createServerClient(
        NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
                        } catch { /* best-effort cleanup; failure is non-fatal */ }
                    },
                },
        }
    )
}
