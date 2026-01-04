'use client';

import Link from 'next/link';
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import React, { ReactElement, useState, useEffect, useContext } from 'react';
import { SupabaseBrowserClientContext } from '@/components/providers/SupabaseAuthProvider';
import {
  Book,
  GraduationCap,
  LayoutDashboard,
  Library,
  FileText,
  MessagesSquare,
  Users,
  School,
  Calendar,
  BarChart,
  FileCheck,
  ListChecks,
  FilePlus,
  BarChart2,
  LogOut,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Building2,
  Users2
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
    label: 'Organizations',
    icon: <Building2 className="h-5 w-5" />,
    href: '/admin/organizations'
  },
  {
    label: 'Grades',
    icon: <School className="h-5 w-5" />,
    href: '/admin/grades'
  },
  {
    label: 'Time Tables',
    icon: <Calendar className="h-5 w-5" />,
    href: '/admin/timetables'
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
  {
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />,
    href: '/teachers/dashboard'
  },
  {
    label: 'Lessons',
    icon: <Book className="h-5 w-5" />,
    href: '/teachers/lessons'
  },
  {
    label: 'Content',
    icon: <FileText className="h-5 w-5" />,
    href: '/teachers/content'
  },
  {
    label: 'Resources',
    icon: <Library className="h-5 w-5" />,
    href: '/teachers/resources'
  },
  {
    label: 'Time Table',
    icon: <Calendar className="h-5 w-5" />,
    href: '/teachers/timetable'
  },
  {
    label: 'Assessments',
    icon: <FileCheck className="h-5 w-5" />,
    href: '/assessments',
    submenu: [
      {
        label: 'All Assessments',
        icon: <ListChecks className="h-5 w-5" />,
        href: '/assessments'
      },
      {
        label: 'Create Assessment',
        icon: <FilePlus className="h-5 w-5" />,
        href: '/assessments/create'
      }
    ]
  }
];

const studentLinks: SidebarLink[] = [
  {
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />,
    href: '/students/dashboard'
  },
  {
    label: 'Lessons',
    icon: <Book className="h-5 w-5" />,
    href: '/students/lessons'
  },
  {
    label: 'Practice',
    icon: <FileText className="h-5 w-5" />,
    href: '/students/practice'
  },
  {
    label: 'Time Table',
    icon: <Calendar className="h-5 w-5" />,
    href: '/students/timetable'
  },
  {
    label: 'AI Tutor',
    icon: <MessagesSquare className="h-5 w-5" />,
    href: '/students/tutor'
  },
  {
    label: 'Collaborator',
    icon: <Users className="h-5 w-5" />,
    href: '/students/collaborator'
  },
  {
    label: 'Assessments',
    icon: <FileCheck className="h-5 w-5" />,
    href: '/assessments'
  },
  {
    label: 'Illustrator',
    icon: <BarChart className="h-5 w-5" />,
    href: '/students/illustrator'
  }
];

interface SidebarProps {
  role: 'admin' | 'teacher' | 'student';
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useContext(SupabaseBrowserClientContext);
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

  // Theme toggle state (default to dark)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  useEffect(() => {
    // On mount, read saved theme or default to dark
    const saved = typeof window !== 'undefined' && localStorage.getItem('theme');
    const initial = (saved === 'light' || saved === 'dark') ? saved : 'dark';
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

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
    default:
      links = studentLinks;
  }

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className={cn("h-screen bg-card border-r flex flex-col transition-all duration-200 ease-in-out", collapsed ? "w-16" : "w-64")}>
      <div>
        <div className="p-6">
          <h1 className={cn("text-2xl font-bold gradient-text", { 'text-center': collapsed })}>
            EduSync
          </h1>
          {!collapsed && (
            <p className="text-sm text-muted-foreground mt-1">
              {role.charAt(0).toUpperCase() + role.slice(1)} Portal
            </p>
          )}
        </div>

        <div className="px-3 py-2">
          {/* collapse toggle */}
          <Button variant="ghost" onClick={toggleCollapse} className={cn("w-full p-2 mb-2", collapsed ? "justify-center" : "justify-end")}>
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>
          <div className="space-y-1">
            {links.map((link: SidebarLink) => {
              const Icon = link.icon.type as React.FC<any>;
              return (
                <div key={link.href}>
                  <Button
                    variant={isActive(link.href) ? "secondary" : "ghost"}
                    size={collapsed ? 'icon' : 'default'}
                    asChild
                    className={cn("w-full", {
                      'justify-center': collapsed,
                      'justify-start': !collapsed,
                      'mb-1': link.submenu
                    })}
                  >
                    <Link href={link.href} className="flex items-center w-full">
                      <Icon className={collapsed ? 'h-8 w-8 p-1' : 'h-5 w-5 mr-3'} />
                      {!collapsed && <span className="ml-3">{link.label}</span>}
                    </Link>
                  </Button>
                  {!collapsed && link.submenu && (
                    <div className="ml-6 space-y-1">
                      {link.submenu.map((sublink: SidebarLink) => {
                        const SubIcon = sublink.icon.type as React.FC<any>;
                        return (
                          <Button
                            key={sublink.href}
                            variant={isActive(sublink.href) ? "secondary" : "ghost"}
                            size={collapsed ? 'icon' : 'default'}
                            asChild
                            className="w-full justify-start"
                          >
                            <Link href={sublink.href} className="flex items-center w-full">
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

      <div className="mt-auto p-3 space-y-2">
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'default'}
          className={cn("w-full", { "justify-center": collapsed, "justify-start": !collapsed })}
          onClick={toggleTheme}
        >
          {theme === 'dark'
            ? collapsed
              ? <Sun className="h-8 w-8" />
              : <Sun className="h-5 w-5 mr-3" />
            : collapsed
              ? <Moon className="h-8 w-8" />
              : <Moon className="h-5 w-5 mr-3" />
          }
          {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </Button>
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'default'}
          className={cn("w-full text-red-500 hover:text-red-500", { "justify-center": collapsed, "justify-start": !collapsed })}
          onClick={async () => {
            await supabase?.auth.signOut();
            router.replace(`/login`);
          }}
        >
          {collapsed
            ? <LogOut className="h-8 w-8" />
            : <LogOut className="h-5 w-5 mr-3" />
          }
          {!collapsed && <span className="ml-3">Logout</span>}
        </Button>
      </div>
    </div>
  );
}