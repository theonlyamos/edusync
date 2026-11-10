'use client';

import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { brandingStylesheet, type BrandingMode, type SchoolBranding } from '@/lib/school-branding';
import { setSchoolDefaultTheme } from '@/lib/theme';

export type ClientBranding = {
  school: { id: string; name: string };
  branding: Omit<SchoolBranding, 'logoPath'> & { logoUrl: string | null };
};

const CACHE_KEY = 'school-branding';
const STYLE_ID = 'school-branding-style';
const ICON_ID = 'school-branding-icon';

let state: { userId: string; data: ClientBranding | null } | null = null;
/** The person whose branding the page should show right now, or null (e.g. platform admin portal). */
let activeUser: string | null = null;
/** Users whose branding was fetched during this page load. */
const fetched = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function readCache(userId: string): ClientBranding | null | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { userId?: string; data?: ClientBranding | null };
    return parsed.userId === userId ? parsed.data ?? null : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(userId: string, data: ClientBranding | null) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, data }));
  } catch {
    // Storage can be blocked; the next page load just fetches again.
  }
}

/** Puts the school's colours and tab icon on the page, or takes them off. */
function paint(data: ClientBranding | null) {
  if (typeof document === 'undefined') return;
  const css = data ? brandingStylesheet(data.branding) : '';
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (css) {
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
  } else {
    style?.remove();
  }

  const logoUrl = data?.branding.logoUrl ?? null;
  let icon = document.getElementById(ICON_ID) as HTMLLinkElement | null;
  if (logoUrl) {
    if (!icon) {
      icon = document.createElement('link');
      icon.id = ICON_ID;
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    if (icon.getAttribute('href') !== logoUrl) icon.href = logoUrl;
  } else {
    icon?.remove();
  }
}

function setState(userId: string, data: ClientBranding | null) {
  state = { userId, data };
  paint(data);
  emit();
}

async function load(userId: string) {
  if (fetched.has(userId)) return;
  fetched.add(userId);
  try {
    const res = await fetch('/api/schools/branding', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    const data: ClientBranding | null = body?.school && body?.branding ? body : null;
    writeCache(userId, data);
    setSchoolDefaultTheme((data?.branding.mode ?? null) as BrandingMode | null);
    if (activeUser === userId) setState(userId, data);
  } catch {
    // Keep whatever was cached; try again on the next page load.
    fetched.delete(userId);
  }
}

/** Shows new branding straight away, e.g. after an admin saves it in settings. */
export function updateSchoolBranding(userId: string, data: ClientBranding | null) {
  writeCache(userId, data);
  setSchoolDefaultTheme((data?.branding.mode ?? null) as BrandingMode | null);
  if (activeUser === userId) setState(userId, data);
}

/** Back to InsyteAI colours, e.g. on sign-out or in the platform admin portal. */
export function clearSchoolBrandingFromPage() {
  state = null;
  activeUser = null;
  paint(null);
  // Don't let the school's default look follow into a sign-out or another portal.
  // A personal Light/Dark/System choice is kept.
  setSchoolDefaultTheme(null);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The signed-in person's school branding, applied to the page. Uses the copy
 * saved in the browser first so colours don't flash, then refreshes it once
 * per page load.
 */
export function useSchoolBranding(userId: string | null, enabled: boolean): ClientBranding | null {
  useIsomorphicLayoutEffect(() => {
    if (!userId || !enabled) {
      clearSchoolBrandingFromPage();
      return;
    }
    activeUser = userId;
    if (state?.userId !== userId) {
      const cached = readCache(userId);
      if (cached !== undefined) setState(userId, cached);
      else if (state) {
        state = null;
        paint(null);
        emit();
      }
    } else {
      paint(state.data);
    }
    void load(userId);
  }, [userId, enabled]);

  return useSyncExternalStore(
    subscribe,
    () => (userId && enabled && state?.userId === userId ? state.data : null),
    () => null,
  );
}
