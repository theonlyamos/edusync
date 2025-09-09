'use client';

import { createBrowserClient } from '@supabase/ssr';
import { createContext, useEffect, useMemo, useState } from 'react';
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

  return (
    <SupabaseBrowserClientContext.Provider value={supabase}>
      <SupabaseSessionContext.Provider value={session}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SupabaseSessionContext.Provider>
    </SupabaseBrowserClientContext.Provider>
  );
}