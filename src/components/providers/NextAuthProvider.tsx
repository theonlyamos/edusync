'use client';

import { createBrowserClient } from '@supabase/ssr';
import { createContext, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface Props {
  children: React.ReactNode;
}

// Create one QueryClient instance for the app
const queryClient = new QueryClient();

export const SupabaseBrowserClientContext = createContext<any>(null);

export function NextAuthProvider({ children }: Props) {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  return (
    <SupabaseBrowserClientContext.Provider value={supabase}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SupabaseBrowserClientContext.Provider>
  );
}