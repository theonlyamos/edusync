'use client';

import Link from 'next/link';
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import React, { ReactElement, useState, useEffect } from 'react';
import { ProfileMenu } from './ProfileMenu';
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
  ChevronLeft,
  ChevronRight,
  Building2,
  CreditCard,
  Settings,
  ShieldCheck,
  Users2,
  Video,
  ClipboardCheck,
  Layers,
} from "lucide-react";

interface SidebarLink {
  label: string;
  icon: ReactElement;
  href: string;
  submenu?: SidebarLink[];
}

const adminLinks: SidebarLink[] = [
  {
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />,
    href: '/admin/dashboard'
  },
  {
    label: 'Teachers',
    icon: <Users className="h-5 w-5" />,
    href: '/admin/users/teachers'
  },
  {
    label: 'Students',
    icon: <GraduationCap className="h-5 w-5" />,
    href: '/admin/users/students'
  },
  {
    label: 'Admins',
    icon: <Users2 className="h-5 w-5" />,
    href: '/admin/users/admins'
  },
  {
    label: 'Schools & orgs',
    icon: <Building2 className="h-5 w-5" />,
    href: '/admin/organizations'
  },
  {
    label: 'Lessons',
    icon: <Book className="h-5 w-5" />,
    href: '/admin/lessons'
  },
  {
    label: 'Assessments',
    icon: <FileCheck className="h-5 w-5" />,
    href: '/admin/assessments',
    submenu: [
      {
        label: 'All Assessments',
        icon: <ListChecks className="h-5 w-5" />,
        href: '/admin/assessments'
      },
      {
        label: 'Results Overview',
        icon: <BarChart2 className="h-5 w-5" />,
        href: '/admin/assessments/results'
      }
    ]
  }
];

const teacherLinks: SidebarLink[] = [
  { label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, href: '/teachers/dashboard' },
  { label: 'Lessons', icon: <Book className="h-5 w-5" />, href: '/teachers/lessons' },
  { label: 'Homework', icon: <FileCheck className="h-5 w-5" />, href: '/teachers/homework' },
  { label: 'Students', icon: <Users className="h-5 w-5" />, href: '/teachers/students' },
  { label: 'Live classes', icon: <Video className="h-5 w-5" />, href: '/teachers/live' },
  { label: 'Timetable', icon: <Calendar className="h-5 w-5" />, href: '/teachers/timetable' },
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
  { label: 'Administrators', icon: <ShieldCheck className="h-5 w-5" />, href: '/school/administrators' },
  { label: 'Grades', icon: <Layers className="h-5 w-5" />, href: '/school/grades' },
  { label: 'Lessons', icon: <Book className="h-5 w-5" />, href: '/school/lessons' },
  { label: 'Timetables', icon: <Calendar className="h-5 w-5" />, href: '/school/timetables' },
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
  { label: 'Practice', icon: <FileText className="h-5 w-5" />, href: '/students/practice' },
  { label: 'Assessments', icon: <ClipboardCheck className="h-5 w-5" />, href: '/assessments' },
  { label: 'Study companion', icon: <MessagesSquare className="h-5 w-5" />, href: '/students/tutor' },
  { label: 'Collaborator', icon: <Users className="h-5 w-5" />, href: '/students/collaborator' },
  { label: 'My performance', icon: <BarChart2 className="h-5 w-5" />, href: '/students/homework/performance' },
];

export type PortalRole = 'admin' | 'teacher' | 'student' | 'school';

interface SidebarProps {
  role: PortalRole;
  mobile?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ role, mobile = false, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  // Sidebar collapse state
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem('sidebar-collapsed');
    const initial = saved === 'true';
    setCollapsed(initial);
  }, []);
  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  };
  let links: SidebarLink[];

  switch (role) {
    case 'admin':
      links = adminLinks;
      break;
    case 'teacher':
      links = teacherLinks;
      break;
    case 'student':
      links = studentLinks;
      break;
    case 'school':
      links = schoolLinks;
      break;
    default:
      links = studentLinks;
  }

  // Highlight only the most specific matching link, so My performance and
  // Homework aren't both active. The AI tutor counts as part of Lessons.
  const currentPath = pathname.startsWith('/students/learn') ? '/students/lessons' : pathname;
  const allHrefs = links.flatMap((link) => [link.href, ...(link.submenu ?? []).map((sub) => sub.href)]);
  const activeHref = allHrefs
    .filter((href) => currentPath === href || currentPath.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;
  const isCollapsed = !mobile && collapsed;

  return (
    <div className={cn("h-full min-h-0 shrink-0 bg-card border-r flex flex-col transition-all duration-200 ease-in-out", mobile ? "w-full" : isCollapsed ? "w-16" : "w-64")}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={cn('p-6', isCollapsed && 'px-2')}>
          <Link href="/" aria-label="InsyteAI home" className={cn("flex", isCollapsed && "justify-center")}>
            <Logo iconOnly={isCollapsed} markClassName="h-8 w-8" />
          </Link>
          {!isCollapsed && (
            <p className="text-sm text-muted-foreground mt-1">
              {role.charAt(0).toUpperCase() + role.slice(1)} Portal
            </p>
          )}
        </div>

        <div className="px-3 py-2">
          {/* collapse toggle */}
          {!mobile && <Button variant="ghost" onClick={toggleCollapse} aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'} className={cn("w-full p-2 mb-2", isCollapsed ? "justify-center" : "justify-end")}>
            {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>}
          <div className="space-y-1">
            {links.map((link: SidebarLink) => {
              const Icon = link.icon.type as React.FC<any>;
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
                    <Link href={link.href} prefetch={false} onClick={onNavigate} aria-label={link.label} aria-current={isActive(link.href) ? 'page' : undefined} className="flex items-center w-full">
                      <Icon className={isCollapsed ? 'h-8 w-8 p-1' : 'h-5 w-5 mr-3'} />
                      {!isCollapsed && <span className="ml-3">{link.label}</span>}
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
