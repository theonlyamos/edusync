'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ChevronUp, CreditCard, LifeBuoy, LogOut, Monitor, Moon, School, Settings, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AppUserContext, SupabaseBrowserClientContext, SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import {
  applyThemePreference,
  readThemePreference,
  saveThemePreference,
  subscribeThemePreference,
  watchSystemTheme,
  type ThemePreference,
} from '@/lib/theme';
import { SUPPORT_READ_EVENT } from '@/lib/support';

type Role = 'admin' | 'teacher' | 'student' | 'school';

interface SchoolInfo {
  id: string;
  name: string;
  canManage: boolean;
}

interface MenuLink {
  label: string;
  href: string;
  icon: ReactNode;
}

const SETTINGS_HREF: Record<Role, string> = {
  teacher: '/teachers/profile',
  admin: '/admin/settings',
  student: '/students/settings',
  school: '/school/account',
};

/** Help & feedback for this portal, remembering the page the person came from. Platform admins answer requests instead. */
export function helpMenuHref(role: Role, from: string | null | undefined): string | null {
  if (role === 'admin') return null;
  const base = role === 'school' ? '/school/help' : '/help';
  const onHelp = from === base || from?.startsWith(`${base}?`);
  return from && !onHelp ? `${base}?from=${encodeURIComponent(from)}` : base;
}

let supportUnreadCache: { unread: number; at: number } | null = null;

/** Replies from support the person hasn't read. */
function useSupportUnread(enabled: boolean) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = (force = false) => {
      // The menu remounts on every page, so reuse a recent count instead of asking again.
      if (!force && supportUnreadCache && Date.now() - supportUnreadCache.at < 60_000) {
        setUnread(supportUnreadCache.unread);
        return;
      }
      fetch('/api/support/summary', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          if (typeof body?.unread !== 'number') return;
          supportUnreadCache = { unread: body.unread, at: Date.now() };
          if (active) setUnread(body.unread);
        })
        .catch(() => { /* leave the count as it was */ });
    };
    const refresh = () => load(true);
    load();
    window.addEventListener(SUPPORT_READ_EVENT, refresh);
    return () => { active = false; window.removeEventListener(SUPPORT_READ_EVENT, refresh); };
  }, [enabled]);
  return enabled ? unread : 0;
}

/** The menu links a role can actually open. School billing and the school portal are for school owners and admins only. */
export function profileMenuLinks(role: Role, school: SchoolInfo | null | undefined): MenuLink[] {
  const links: MenuLink[] = [];
  const iconClass = 'h-4 w-4';
  if (school?.canManage) {
    links.push({ label: 'Billing', href: '/school/billing', icon: <CreditCard className={iconClass} /> });
  } else if (school === null && role !== 'admin' && role !== 'school') {
    // Without a school, people pay for their own tutor minutes.
    links.push({ label: 'Billing', href: '/learn/credits', icon: <CreditCard className={iconClass} /> });
  }
  links.push({ label: role === 'school' ? 'Account settings' : 'Settings', href: SETTINGS_HREF[role], icon: <Settings className={iconClass} /> });
  if (role !== 'school' && school?.canManage) {
    links.push({ label: 'School admin', href: '/school/dashboard', icon: <School className={iconClass} /> });
  }
  return links;
}

export function initials(name: string) {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return parts[0].charAt(0).toUpperCase();
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4 shrink-0" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4 shrink-0" /> },
  { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4 shrink-0" /> },
];

/**
 * The saved appearance, shared by every menu on the page (phones mount a
 * second sidebar in the navigation drawer), following the device when set to System.
 */
function useThemePreference() {
  const preference = useSyncExternalStore(subscribeThemePreference, readThemePreference, () => 'dark' as ThemePreference);
  useEffect(() => {
    applyThemePreference(readThemePreference());
    return watchSystemTheme();
  }, []);
  return [preference, saveThemePreference] as const;
}

interface ProfileMenuProps {
  role: Role;
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function ProfileMenu({ role, collapsed = false, onNavigate }: ProfileMenuProps) {
  const router = useRouter();
  const supabase = useContext(SupabaseBrowserClientContext);
  const session = useContext(SupabaseSessionContext);
  const { user } = useContext(AppUserContext);
  const [preference, choosePreference] = useThemePreference();
  // undefined while loading, null when the user has no school.
  const [school, setSchool] = useState<SchoolInfo | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    fetch('/api/schools/current')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { school: { id: string; name: string } | null; role?: string }) => {
        if (!active) return;
        setSchool(data.school
          ? { id: data.school.id, name: data.school.name, canManage: data.role === 'owner' || data.role === 'admin' }
          : null);
      })
      .catch(() => {
        // Leave school-only links hidden if we can't tell.
      });
    return () => { active = false; };
  }, []);

  const pathname = usePathname();
  const helpHref = helpMenuHref(role, pathname);
  const supportUnread = useSupportUnread(helpHref !== null);
  const name = user?.name?.trim() || session?.user?.user_metadata?.name || user?.email || 'Your account';
  const links = profileMenuLinks(role, school);

  const signOut = async () => {
    await supabase?.auth.signOut();
    router.replace('/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${name}, account menu${supportUnread ? `, ${supportUnread} new ${supportUnread === 1 ? 'reply' : 'replies'} from support` : ''}`}
        className={cn(
          'group flex w-full items-center gap-3 rounded-lg border bg-muted/40 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted',
          collapsed ? 'justify-center p-2' : 'min-h-14 px-3 py-2',
        )}
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-sm font-semibold text-primary" aria-hidden>
          {initials(name)}
          {supportUnread > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card" />}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">Account settings</span>
            </span>
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:rotate-180" aria-hidden />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? 'right' : 'top'}
        align={collapsed ? 'end' : 'start'}
        sideOffset={8}
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[15rem] rounded-xl p-1.5"
      >
        {links.length > 0 && (
          <>
            {links.map((link) => (
              <DropdownMenuItem key={link.label} asChild className="min-h-10 gap-3 rounded-md px-3 text-sm">
                <Link href={link.href} prefetch={false} onClick={onNavigate}>
                  {link.icon}
                  {link.label}
                </Link>
              </DropdownMenuItem>
            ))}
            {helpHref && (
              <DropdownMenuItem asChild className="min-h-10 gap-3 rounded-md px-3 text-sm">
                <Link href={helpHref} prefetch={false} onClick={onNavigate}>
                  <LifeBuoy className="h-4 w-4" />
                  <span className="flex-1">Help &amp; feedback</span>
                  {supportUnread > 0 && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
                      {supportUnread} new
                    </span>
                  )}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="my-1.5" />
          </>
        )}
        <DropdownMenuLabel className="px-3 pb-2 pt-1 text-xs font-normal text-muted-foreground">Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => choosePreference(value as ThemePreference)}
          className="mx-1.5 mb-1 grid grid-cols-3 gap-1 rounded-lg border p-1"
        >
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuPrimitive.RadioItem
              key={option.value}
              value={option.value}
              onSelect={(event) => event.preventDefault()}
              className="flex min-h-9 cursor-default select-none items-center justify-center gap-1 rounded-md px-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus:bg-accent focus:text-accent-foreground data-[state=checked]:bg-background data-[state=checked]:font-medium data-[state=checked]:text-foreground data-[state=checked]:shadow-sm"
            >
              {option.icon}
              {option.label}
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuItem
          onSelect={signOut}
          className="min-h-10 gap-3 rounded-md px-3 text-sm text-red-500 focus:bg-red-500/10 focus:text-red-500"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
