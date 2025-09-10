import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export const authOptions = {} as any;

export interface CookieAdapter {
    getAll: () => { name: string; value: string }[];
    setAll: (cookiesToSet: { name: string; value: string; options: any }[]) => void;
}

export async function getServerSession(adapter?: CookieAdapter): Promise<null | { user: { id: string; email: string; name: string | null; role: string | null; image: string | null } }> {
    const cookieStore = adapter ? null : await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: adapter
                ? {
                    getAll() {
                        return adapter.getAll();
                    },
                    setAll(cookiesToSet) {
                        adapter.setAll(cookiesToSet);
                    },
                }
                : {
                    getAll() {
                        return (cookieStore as any).getAll().map(({ name, value }: any) => ({ name, value }));
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                (cookieStore as any).set({ name, value, ...options })
                            );
                        } catch { }
                    },
                },
        },
    );

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;
    const { data: appUser } = await supabase
        .from('users')
        .select('id, email, name, role, image')
        .eq('id', authUser.id)
        .maybeSingle();
    return {
        user: {
            id: authUser.id,
            email: authUser.email ?? appUser?.email ?? '',
            name: appUser?.name ?? authUser.user_metadata?.name ?? null,
            role: (appUser as any)?.role ?? null,
            image: appUser?.image ?? null,
        },
    };
}