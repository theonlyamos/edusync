'use client';

import { createBrowserClient } from '@supabase/ssr';
import { createContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { shouldClearInvalidRefreshSession } from '@/lib/auth-session';
import type { AppUser } from '@/lib/app-user';

interface Props {
  children: React.ReactNode;
}

// Create one QueryClient instance for the app
const queryClient = new QueryClient();

export const SupabaseBrowserClientContext = createContext<any>(null);
export const SupabaseSessionContext = createContext<any>(null);
export const AppUserContext = createContext<{ user: AppUser | null; loading: boolean; error: string | null }>({
  user: null, loading: true, error: null,
});

export function SupabaseAuthProvider({ children }: Props) {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [session, setSession] = useState<any>(undefined);
  const [profile, setProfile] = useState<{ userId: string; user: AppUser | null; error: string | null } | null>(null);
  const exchangingCode = useRef(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const redirectedFromRaw = url.searchParams.get('redirectedFrom');
    if (code && !exchangingCode.current) {
      exchangingCode.current = true;
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        const params = new URLSearchParams();
        if (error) params.set('error', 'oauth');
        else if (redirectedFromRaw) params.set('redirectedFrom', redirectedFromRaw);
        window.location.replace(`/login${params.size ? `?${params}` : ''}`);
      }).catch(() => window.location.replace('/login?error=oauth'));
    }
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    let authChanged = false;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted || authChanged) return;
      if (error && shouldClearInvalidRefreshSession(error)) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        if (mounted) setSession(null);
        if (window.location.pathname !== '/login') {
          window.location.replace('/login?reason=session-expired');
        }
        return;
      }
      if (mounted) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      authChanged = true;
      if (mounted) {
        setSession(sess);
        if (!sess) setProfile(null);
      }
    });
    return () => {
      mounted = false;
      sub.subscription?.unsubscribe?.();
    };
  }, [supabase]);

  const authUser = session?.user;
  const userId = authUser?.id;
  useEffect(() => {
    let active = true;
    if (!userId) return;
    const provision = async () => {
      try {
        const { data: existing, error } = await supabase.from('users')
          .select('id, email, name, image, role').eq('id', userId).maybeSingle();
        if (error) throw error;
        if (!active) return;
        let user: AppUser | null = existing;
        if (!user) {
          const { data } = await axios.post<{ user: AppUser }>('/api/auth/provision', {
            id: authUser.id,
            email: authUser.email,
            name: authUser.user_metadata?.name ?? null,
            image: authUser.user_metadata?.avatar_url ?? null,
          });
          user = data.user;
        }
        if (!user || user.id !== userId) throw new Error('Invalid app profile');
        if (active) setProfile({ userId, user, error: null });
      } catch {
        if (active) setProfile({ userId, user: null, error: 'Unable to load your account. Please try again.' });
      }
    };
    provision();
    return () => { active = false; };
  }, [userId, authUser, supabase]);

  const currentProfile = profile?.userId === userId ? profile : null;

  return (
    <SupabaseBrowserClientContext.Provider value={supabase}>
      <SupabaseSessionContext.Provider value={session}>
        <AppUserContext.Provider value={{
          user: currentProfile?.user ?? null,
          loading: session === undefined || Boolean(userId && !currentProfile),
          error: currentProfile?.error ?? null,
        }}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </AppUserContext.Provider>
      </SupabaseSessionContext.Provider>
    </SupabaseBrowserClientContext.Provider>
  );
}
