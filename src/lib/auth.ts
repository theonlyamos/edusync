import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export const authOptions = {} as any;

export async function getServerSession(): Promise<null | { user: { id: string; email: string; name: string | null; role: string | null; image: string | null } }> {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value;
                },
            },
        }
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

// Removed legacy NextAuthOptions definition to avoid duplicate `authOptions` and next-auth coupling.