'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppUserContext } from '@/components/providers/SupabaseAuthProvider';
import { getAppRedirect } from '@/lib/app-user';
import type { SchoolSetupStep } from '@/lib/school-registration';

export type PortalSchool = {
  id: string;
  name: string;
  description: string | null;
  country: string | null;
  timezone: string | null;
  gradeLevels: string[];
  setupDismissedAt: string | null;
};

export type SchoolPortalState = {
  school: PortalSchool;
  /** The viewer's school role: owner or admin. */
  role: 'owner' | 'admin';
  isOwner: boolean;
  setup: { steps: SchoolSetupStep[]; teacherCount: number; studentCount: number };
  /** Loads the school again, e.g. after its details change. */
  reload: () => Promise<void>;
};

const SchoolPortalContext = createContext<SchoolPortalState | null>(null);

/** The school this portal manages. Only inside the /school pages. */
export function useSchoolPortal(): SchoolPortalState {
  const value = useContext(SchoolPortalContext);
  if (!value) throw new Error('useSchoolPortal must be used inside the school portal');
  return value;
}

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'none' }
  | { state: 'suspended' }
  | { state: 'member' }
  | { state: 'ready'; data: Omit<SchoolPortalState, 'reload'> };

/** Loads the viewer's school and only shows the portal to its owner and administrators. */
export function SchoolPortalProvider({ children }: { children: ReactNode }) {
  const { user } = useContext(AppUserContext);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/schools/current', { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not load your school');
      if (!body?.school) return setLoaded({ state: body?.suspended ? 'suspended' : 'none' });
      if (body.role !== 'owner' && body.role !== 'admin') return setLoaded({ state: 'member' });
      setLoaded({
        state: 'ready',
        data: { school: body.school, role: body.role, isOwner: Boolean(body.isOwner), setup: body.setup },
      });
    } catch (error) {
      setLoaded({ state: 'error', message: error instanceof Error ? error.message : 'Could not load your school' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loaded.state === 'loading') {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>;
  }
  if (loaded.state !== 'ready') {
    const home = getAppRedirect(user?.role ?? null);
    const message = loaded.state === 'error'
      ? loaded.message
      : loaded.state === 'none'
        ? 'Your account isn’t part of a school yet.'
        : loaded.state === 'suspended'
          ? 'Your school’s account is paused. Contact InsyteAI support to sort it out.'
          : 'Only the school owner and administrators can open the school admin portal.';
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">School admin portal</h1>
        <p className="text-muted-foreground">{message}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {loaded.state === 'error' && <Button onClick={() => { setLoaded({ state: 'loading' }); void load(); }}>Try again</Button>}
          {loaded.state === 'none' && <Button asChild><Link href="/register-school">Register a school</Link></Button>}
          {loaded.state === 'suspended' && <Button asChild><Link href="/help">Contact support</Link></Button>}
          <Button asChild variant="outline"><Link href={home}>Go to my home page</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <SchoolPortalContext.Provider value={{ ...loaded.data, reload: load }}>
      {children}
    </SchoolPortalContext.Provider>
  );
}

/** Page heading used by every school portal page. */
export function SchoolPageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
