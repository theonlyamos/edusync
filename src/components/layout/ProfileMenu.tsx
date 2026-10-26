'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ChevronUp, CreditCard, LogOut, Monitor, Moon, School, Settings, Sun } from 'lucide-react';
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

  const name = user?.name?.trim() || session?.user?.user_metadata?.name || user?.email || 'Your account';
  const links = profileMenuLinks(role, school);

  const signOut = async () => {
    await supabase?.auth.signOut();
    router.replace('/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${name}, account menu`}
        className={cn(
          'group flex w-full items-center gap-3 rounded-lg border bg-muted/40 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted',
          collapsed ? 'justify-center p-2' : 'min-h-14 px-3 py-2',
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-sm font-semibold text-primary" aria-hidden>
          {initials(name)}
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
