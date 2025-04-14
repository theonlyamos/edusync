'use client';

import Link from 'next/link';
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { signOut } from 'next-auth/react';
import { ReactElement } from 'react';
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
  UsersRound,
  LogOut
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
    icon: <UsersRound className="h-5 w-5" />,
    href: '/admin/users/admins'
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
    label: 'Assessments',
    icon: <FileCheck className="h-5 w-5" />,
    href: '/assessments'
  }
];

interface SidebarProps {
  role: 'admin' | 'teacher' | 'student';
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
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
    default:
      links = studentLinks;
  }

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className="w-64 h-screen bg-card border-r flex flex-col">
      <div>
        <div className="p-6">
          <h1 className="text-2xl font-bold gradient-text">EduSync</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {role.charAt(0).toUpperCase() + role.slice(1)} Portal
          </p>
        </div>

        <div className="px-3 py-2">
          <div className="space-y-1">
            {links.map((link: SidebarLink) => (
              <div key={link.href}>
                <Button
                  variant={isActive(link.href) ? "secondary" : "ghost"}
                  className={cn("w-full justify-start", {
                    'mb-1': link?.submenu
                  })}
                  asChild
                >
                  <Link href={link.href}>
                    {link.icon}
                    <span className="ml-3">{link.label}</span>
                  </Link>
                </Button>
                {link.submenu && (
                  <div className="ml-6 space-y-1">
                    {link.submenu.map((sublink: SidebarLink) => (
                      <Button
                        key={sublink.href}
                        variant={isActive(sublink.href) ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        asChild
                      >
                        <Link href={sublink.href}>
                          {sublink.icon}
                          <span className="ml-3">{sublink.label}</span>
                        </Link>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto p-3">
        <Button
          variant="ghost"
          className="w-full justify-start text-red-500 hover:bg-red-500 hover:text-white"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <LogOut className="h-5 w-5 mr-3" />
          <span className="ml-3">Logout</span>
        </Button>
      </div>
    </div>
  );
} 