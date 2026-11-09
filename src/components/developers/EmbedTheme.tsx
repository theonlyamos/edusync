'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseEmbedTheme } from '@/lib/embed-theme';

function Apply() {
  const params = useSearchParams();
  const theme = params.get('theme');
  const accent = params.get('accent');
  useEffect(() => {
    const { mode, accent: colours } = parseEmbedTheme({ get: (name) => (name === 'theme' ? theme : name === 'accent' ? accent : null) });
    const root = document.documentElement;
    if (mode) root.classList.toggle('dark', mode === 'dark');
    if (colours) {
      root.style.setProperty('--primary', colours.primary);
      root.style.setProperty('--primary-foreground', colours.foreground);
      root.style.setProperty('--ring', colours.primary);
    }
    return () => {
      for (const name of ['--primary', '--primary-foreground', '--ring']) root.style.removeProperty(name);
    };
  }, [theme, accent]);
  return null;
}

/** Applies `?theme=light|dark` and `?accent=<hex>` to an embedded tutor page. */
export function EmbedTheme() {
  return <Suspense fallback={null}><Apply /></Suspense>;
}
