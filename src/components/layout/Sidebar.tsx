'use client';

import Link from 'next/link';
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import React, { ReactElement, useState, useEffect, useRef } from 'react';
import { ProfileMenu } from './ProfileMenu';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useAdminSupportUnread } from '@/components/support/AdminSupportBadge';
import {
  Book,
  GraduationCap,
  LayoutDashboard,
  Library,
  FileText,
  MessagesSquare,
  Users,
  Calendar,
  FileCheck,
  ListChecks,
  BarChart2,
  PanelLeft,
  CreditCard,
  Settings,
  ShieldCheck,
  Video,
  ClipboardCheck,
  Layers,
  School,
  BookMarked,
  Activity,
  LifeBuoy,
  KeyRound,
  History,
  Megaphone,
  CalendarCheck,
  Table2,
  ScrollText,
  CalendarDays,
  Search,
} from "lucide-react";

interface SidebarLink {
  label: string;
  icon: ReactElement;
  href: string;
  submenu?: SidebarLink[];
}

// The platform admin portal (InsyteAI staff). Schools run their own people and lessons.
const adminLinks: SidebarLink[] = [
  { label: 'Overview', icon: <LayoutDashboard className="h-5 w-5" />, href: '/admin/dashboard' },
  { label: 'Schools', icon: <School className="h-5 w-5" />, href: '/admin/schools' },
  { label: 'Users', icon: <Users className="h-5 w-5" />, href: '/admin/users' },
  { label: 'Billing', icon: <CreditCard className="h-5 w-5" />, href: '/admin/billing' },
  { label: 'AI usage', icon: <Activity className="h-5 w-5" />, href: '/admin/usage' },
  { label: 'Support', icon: <LifeBuoy className="h-5 w-5" />, href: '/admin/support' },
  { label: 'Developers', icon: <KeyRound className="h-5 w-5" />, href: '/admin/organizations' },
  { label: 'Admins', icon: <ShieldCheck className="h-5 w-5" />, href: '/admin/users/admins' },
  { label: 'Activity log', icon: <History className="h-5 w-5" />, href: '/admin/activity' },
];

const teacherLinks: SidebarLink[] = [
  { label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, href: '/teachers/dashboard' },
  { label: 'Lessons', icon: <Book className="h-5 w-5" />, href: '/teachers/lessons' },
  { label: 'Homework', icon: <FileCheck className="h-5 w-5" />, href: '/teachers/homework' },
  { label: 'Students', icon: <Users className="h-5 w-5" />, href: '/teachers/students' },
  { label: 'Attendance', icon: <CalendarCheck className="h-5 w-5" />, href: '/teachers/attendance' },
  { label: 'Gradebook', icon: <Table2 className="h-5 w-5" />, href: '/teachers/gradebook' },
  { label: 'Report cards', icon: <ScrollText className="h-5 w-5" />, href: '/teachers/report-cards' },
  { label: 'Live classes', icon: <Video className="h-5 w-5" />, href: '/teachers/live' },
  { label: 'Timetable', icon: <Calendar className="h-5 w-5" />, href: '/teachers/timetable' },
  { label: 'Calendar', icon: <CalendarDays className="h-5 w-5" />, href: '/teachers/calendar' },
  { label: 'Announcements', icon: <Megaphone className="h-5 w-5" />, href: '/teachers/announcements' },
  // Library pages: everything here can also be reached from inside a lesson.
  { label: 'Content', icon: <FileText className="h-5 w-5" />, href: '/teachers/content' },
  { label: 'Resources', icon: <Library className="h-5 w-5" />, href: '/teachers/resources' },
  { label: 'Assessments', icon: <ListChecks className="h-5 w-5" />, href: '/assessments' },
];

// The school admin portal (school owners and administrators).
const schoolLinks: SidebarLink[] = [
  { label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, href: '/school/dashboard' },
  { label: 'Students', icon: <GraduationCap className="h-5 w-5" />, href: '/school/students' },
  { label: 'Teachers', icon: <Users className="h-5 w-5" />, href: '/school/teachers' },
  { label: 'Parents', icon: <Users className="h-5 w-5" />, href: '/school/parents' },
  { label: 'Administrators', icon: <ShieldCheck className="h-5 w-5" />, href: '/school/administrators' },
  { label: 'Grades', icon: <Layers className="h-5 w-5" />, href: '/school/grades' },
  { label: 'Classes', icon: <School className="h-5 w-5" />, href: '/school/classes' },
  { label: 'Subjects', icon: <BookMarked className="h-5 w-5" />, href: '/school/subjects' },
  { label: 'Lessons', icon: <Book className="h-5 w-5" />, href: '/school/lessons' },
  { label: 'Timetables', icon: <Calendar className="h-5 w-5" />, href: '/school/timetables' },
  { label: 'Calendar', icon: <CalendarDays className="h-5 w-5" />, href: '/school/calendar' },
  { label: 'Attendance', icon: <CalendarCheck className="h-5 w-5" />, href: '/school/attendance' },
  { label: 'Gradebook', icon: <Table2 className="h-5 w-5" />, href: '/school/gradebook' },
  { label: 'Report cards', icon: <ScrollText className="h-5 w-5" />, href: '/school/report-cards' },
  { label: 'Announcements', icon: <Megaphone className="h-5 w-5" />, href: '/school/announcements' },
  { label: 'Reports', icon: <BarChart2 className="h-5 w-5" />, href: '/school/reports' },
  { label: 'Billing', icon: <CreditCard className="h-5 w-5" />, href: '/school/billing' },
  { label: 'Settings', icon: <Settings className="h-5 w-5" />, href: '/school/settings' },
];

const studentLinks: SidebarLink[] = [
  { label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, href: '/students/dashboard' },
  // Learn with AI starts from a lesson, so it lives under Lessons.
  { label: 'Lessons', icon: <Book className="h-5 w-5" />, href: '/students/lessons' },
  { label: 'Homework', icon: <FileCheck className="h-5 w-5" />, href: '/students/homework' },
  { label: 'Live classes', icon: <Video className="h-5 w-5" />, href: '/students/live' },
  { label: 'Timetable', icon: <Calendar className="h-5 w-5" />, href: '/students/timetable' },
  { label: 'Calendar', icon: <CalendarDays className="h-5 w-5" />, href: '/students/calendar' },
  { label: 'Announcements', icon: <Megaphone className="h-5 w-5" />, href: '/students/announcements' },
  { label: 'Practice', icon: <FileText className="h-5 w-5" />, href: '/students/practice' },
  { label: 'Flashcards', icon: <Layers className="h-5 w-5" />, href: '/students/flashcards' },
  { label: 'Assessments', icon: <ClipboardCheck className="h-5 w-5" />, href: '/assessments' },
  { label: 'Study companion', icon: <MessagesSquare className="h-5 w-5" />, href: '/students/tutor' },
  { label: 'Collaborator', icon: <Users className="h-5 w-5" />, href: '/students/collaborator' },
  { label: 'My performance', icon: <BarChart2 className="h-5 w-5" />, href: '/students/homework/performance' },
  { label: 'Report cards', icon: <ScrollText className="h-5 w-5" />, href: '/students/report-cards' },
];

// The parent portal: a read-only view of the students a parent follows.
const parentLinks: SidebarLink[] = [
  { label: 'My children', icon: <Users className="h-5 w-5" />, href: '/parents' },
];

export type PortalRole = 'admin' | 'teacher' | 'student' | 'school' | 'parent';

const LINKS: Record<PortalRole, SidebarLink[]> = { admin: adminLinks, teacher: teacherLinks, student: studentLinks, school: schoolLinks, parent: parentLinks };

/** The pages of a portal, for the jump-to search. */
export const portalPages = (role: PortalRole) => LINKS[role].map(({ label, href }) => ({ label, href }));

interface SidebarProps {
  role: PortalRole;
  mobile?: boolean;
  onNavigate?: () => void;
  /** Opens the jump-to search. */
  onSearch?: () => void;
  /** The person's school; its logo and name replace the InsyteAI logo when it has one. */
  school?: { school: { name: string }; branding: { logoUrl: string | null } } | null;
}

export function Sidebar({ role, mobile = false, onNavigate, onSearch, school }: SidebarProps) {
  const pathname = usePathname();
  const supportUnread = useAdminSupportUnread(role === 'admin');
  // Sidebar collapse state
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem('sidebar-collapsed');
    const initial = saved === 'true';
    setCollapsed(initial);
  }, []);
  // The toggle moves between the header and the link list, so move keyboard focus with it.
  const toggleRef = useRef<HTMLButtonElement>(null);
  const refocusToggle = useRef(false);
  useEffect(() => {
    if (refocusToggle.current) {
      refocusToggle.current = false;
      toggleRef.current?.focus();
    }
  }, [collapsed]);
  const toggleCollapse = () => {
    refocusToggle.current = true;
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  };
  const links = LINKS[role] ?? studentLinks;

  // Highlight only the most specific matching link, so My performance and
  // Homework aren't both active. The AI tutor counts as part of Lessons.
  const currentPath = pathname.startsWith('/students/learn') ? '/students/lessons'
    : pathname.startsWith('/admin/feedback') ? '/admin/support' : pathname;
  const allHrefs = links.flatMap((link) => [link.href, ...(link.submenu ?? []).map((sub) => sub.href)]);
  const activeHref = allHrefs
    .filter((href) => currentPath === href || currentPath.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;
  const isCollapsed = !mobile && collapsed;
  const schoolLogo = school?.branding.logoUrl ?? null;

  return (
    <div className={cn("h-full min-h-0 shrink-0 bg-card border-r flex flex-col transition-all duration-200 ease-in-out", mobile ? "w-full" : isCollapsed ? "w-16" : "w-64")}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={cn('p-6', isCollapsed && 'px-2')}>
          <div className={cn('flex items-center gap-2', isCollapsed ? 'justify-center' : 'justify-between')}>
            {schoolLogo ? (
              <Link href="/" aria-label={`${school!.school.name} home`} className="flex min-w-0 items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- school logos live in Supabase storage */}
                <img src={schoolLogo} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
                {!isCollapsed && (
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold leading-tight text-foreground">{school!.school.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">Powered by InsyteAI</span>
                  </span>
                )}
              </Link>
            ) : (
              <Link href="/" aria-label="InsyteAI home" className="flex min-w-0">
                <Logo iconOnly={isCollapsed} markClassName="h-8 w-8" />
              </Link>
            )}
            {!mobile && !isCollapsed && (
              <div className="flex shrink-0 items-center">
              {role !== 'admin' && <NotificationBell align="start" className="h-9 w-9" />}
              <Button
                variant="ghost"
                size="icon"
                ref={toggleRef}
                onClick={toggleCollapse}
                aria-label="Collapse navigation"
                aria-expanded={true}
                title="Collapse navigation"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <PanelLeft className="h-5 w-5" />
              </Button>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <p className="text-sm text-muted-foreground mt-1">
              {role.charAt(0).toUpperCase() + role.slice(1)} Portal
            </p>
          )}
        </div>

        <div className="px-3 py-2">
          {/* Expand toggle: when collapsed it sits above the links; when expanded it lives in the header. */}
          {!mobile && isCollapsed && (
            <Button
              variant="ghost"
              ref={toggleRef}
              onClick={toggleCollapse}
              aria-label="Expand navigation"
              aria-expanded={false}
              title="Expand navigation"
              className="w-full p-2 mb-2 justify-center"
            >
              <PanelLeft className="h-5 w-5 -scale-x-100" />
            </Button>
          )}
          {!mobile && isCollapsed && role !== 'admin' && (
            <div className="mb-2 flex justify-center"><NotificationBell align="start" /></div>
          )}
          {onSearch && (
            <Button
              variant="outline"
              size={isCollapsed ? 'icon' : 'default'}
              onClick={onSearch}
              aria-label="Search"
              aria-keyshortcuts="Control+K Meta+K"
              title={isCollapsed ? 'Search (Ctrl K)' : undefined}
              className={cn('mb-2 min-h-11 w-full text-muted-foreground', isCollapsed ? 'justify-center' : 'justify-start')}
            >
              <Search className="h-5 w-5 shrink-0" />
              {!isCollapsed && <><span className="ml-3 flex-1 text-left">Search</span><kbd className="hidden rounded border px-1.5 text-[11px] font-medium lg:inline">Ctrl K</kbd></>}
            </Button>
          )}
          <div className="space-y-1">
            {links.map((link: SidebarLink) => {
              const Icon = link.icon.type as React.FC<any>;
              const badge = link.href === '/admin/support' && supportUnread > 0 ? supportUnread : 0;
              const label = badge ? `${link.label}, ${badge} unread` : link.label;
              return (
                <div key={link.href}>
                  <Button
                    variant={isActive(link.href) ? "secondary" : "ghost"}
                    size={isCollapsed ? 'icon' : 'default'}
                    asChild
                    className={cn("w-full min-h-11", {
                      'justify-center': isCollapsed,
                      'justify-start': !isCollapsed,
                      'mb-1': link.submenu
                    })}
                  >
                    <Link href={link.href} prefetch={false} onClick={onNavigate} aria-label={label} title={isCollapsed ? label : undefined} aria-current={isActive(link.href) ? 'page' : undefined} className="relative flex items-center w-full">
                      <Icon className={isCollapsed ? 'h-8 w-8 p-1' : 'h-5 w-5 mr-3'} />
                      {!isCollapsed && <span className="ml-3">{link.label}</span>}
                      {badge > 0 && (isCollapsed
                        ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
                        : <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground" aria-hidden>{badge > 99 ? '99+' : badge}</span>)}
                    </Link>
                  </Button>
                  {!isCollapsed && link.submenu && (
                    <div className="ml-6 space-y-1">
                      {link.submenu.map((sublink: SidebarLink) => {
                        const SubIcon = sublink.icon.type as React.FC<any>;
                        return (
                          <Button
                            key={sublink.href}
                            variant={isActive(sublink.href) ? "secondary" : "ghost"}
                            size={isCollapsed ? 'icon' : 'default'}
                            asChild
                            className="w-full justify-start"
                          >
                            <Link href={sublink.href} prefetch={false} onClick={onNavigate} className="flex items-center w-full">
                              <SubIcon className="h-5 w-5 mr-3" />
                              <span>{sublink.label}</span>
                            </Link>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t p-3">
        <ProfileMenu role={role} collapsed={isCollapsed} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
