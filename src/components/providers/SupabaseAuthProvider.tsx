'use client';

import { createBrowserClient } from '@supabase/ssr';
import { createContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface Props {
  children: React.ReactNode;
}

// Create one QueryClient instance for the app
const queryClient = new QueryClient();

export const SupabaseBrowserClientContext = createContext<any>(null);
export const SupabaseSessionContext = createContext<any>(null);

export function SupabaseAuthProvider({ children }: Props) {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const redirectedFromRaw = url.searchParams.get('redirectedFrom');
    const redirectedFrom = redirectedFromRaw ? decodeURIComponent(redirectedFromRaw) : null;
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(() => {
        if (redirectedFrom) {
          window.location.replace(redirectedFrom);
          return;
        }
        window.location.replace('/learn');
      }).catch(() => {});
    }
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => {
      mounted = false;
      sub.subscription?.unsubscribe?.();
    };
  }, [supabase]);

  const hasProvisionedRef = useRef(false);
  useEffect(() => {
    const provision = async () => {
      if (!session?.user || hasProvisionedRef.current) return;
      try {
        await axios.post('/api/auth/provision', {
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.name ?? null,
          image: session.user.user_metadata?.avatar_url ?? null,
        });
        hasProvisionedRef.current = true;
      } catch {
        // ignore
      }
    };
    provision();
  }, [session]);

  return (
    <SupabaseBrowserClientContext.Provider value={supabase}>
      <SupabaseSessionContext.Provider value={session}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SupabaseSessionContext.Provider>
    </SupabaseBrowserClientContext.Provider>
  );
}