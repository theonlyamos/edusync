'use client';

import { useRouter, usePathname } from 'next/navigation';
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Library,
  Brain,
  MessagesSquare,
  Settings,
  LogOut,
  Users,
  BarChart,
  Calendar,
  BookUser,
  LibraryBig,
  UsersRound,
  GraduationCap,
  School
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from 'next-auth/react';

interface SidebarLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const adminLinks: SidebarLink[] = [
  {
    href: '/admin/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />
  },
  {
    href: '/admin/users/teachers',
    label: 'Teachers',
    icon: <GraduationCap className="h-5 w-5" />
  },
  {
    href: '/admin/users/students',
    label: 'Students',
    icon: <BookUser className="h-5 w-5" />
  },
  {
    href: '/admin/users/admins',
    label: 'Admins',
    icon: <UsersRound className="h-5 w-5" />
  },
  {
    href: '/admin/grades',
    label: 'Grades',
    icon: <LibraryBig className="h-5 w-5" />
  },
  {
    href: '/admin/timetables',
    label: 'Timetables',
    icon: <Calendar className="h-5 w-5" />
  },
  {
    href: '/admin/reports',
    label: 'Reports',
    icon: <BarChart className="h-5 w-5" />
  }
];

const teacherLinks: SidebarLink[] = [
  {
    href: '/teachers/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />
  },
  {
    href: '/teachers/lessons',
    label: 'Lessons',
    icon: <BookOpen className="h-5 w-5" />
  },
  {
    href: '/teachers/content',
    label: 'Content',
    icon: <FileText className="h-5 w-5" />
  },
  {
    href: '/teachers/resources',
    label: 'Resources',
    icon: <Library className="h-5 w-5" />
  },
  {
    href: '/teachers/timetable',
    label: 'Time Table',
    icon: <Calendar className="h-5 w-5" />
  }
];

const studentLinks: SidebarLink[] = [
  {
    href: '/students/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />
  },
  {
    href: '/students/timetable',
    label: 'Time Table',
    icon: <Calendar className="h-5 w-5" />
  },
  {
    href: '/students/lessons',
    label: 'Lessons',
    icon: <BookOpen className="h-5 w-5" />
  },
  {
    href: '/students/practice',
    label: 'Practice',
    icon: <Brain className="h-5 w-5" />
  },
  {
    href: '/students/tutor',
    label: 'AI Tutor',
    icon: <MessagesSquare className="h-5 w-5" />
  }
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  let links: SidebarLink[] = [];
  let roleLabel = '';

  switch (session?.user?.role) {
    case 'admin':
      links = adminLinks;
      roleLabel = 'Admin Panel';
      break;
    case 'teacher':
      links = teacherLinks;
      roleLabel = 'Teacher Portal';
      break;
    case 'student':
      links = studentLinks;
      roleLabel = 'Student Portal';
      break;
    default:
      links = [];
      roleLabel = 'Portal';
  }

  return (
    <div className="flex flex-col w-64 bg-card border-r h-screen">
      {/* Logo */}
      <div className="p-6">
        <h1 className="text-2xl font-bold gradient-text">EduSync</h1>
        <p className="text-sm text-muted-foreground mt-1">{roleLabel}</p>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 space-y-2">
        {links.map((link) => (
          <Button
            key={link.href}
            variant={pathname === link.href ? "secondary" : "ghost"}
            className={cn(
              "w-full justify-start gap-2",
              pathname === link.href && "bg-secondary/20"
            )}
            onClick={() => router.push(link.href)}
          >
            {link.icon}
            {link.label}
          </Button>
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t space-y-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={() => router.push('/settings')}
        >
          <Settings className="h-5 w-5" />
          Settings
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-destructive hover:text-destructive"
          onClick={() => router.push('/api/auth/signout')}
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </Button>
      </div>
    </div>
  );
} 