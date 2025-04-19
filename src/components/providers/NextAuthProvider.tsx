'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface Props {
  children: React.ReactNode;
}

// Create one QueryClient instance for the app
const queryClient = new QueryClient();

export function NextAuthProvider({ children }: Props) {
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={true}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
} 