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
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from 'next-auth/react';

interface SidebarLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}

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
  }
];

const studentLinks: SidebarLink[] = [
  {
    href: '/students/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />
  },
  {
    href: '/students/lessons',
    label: 'My Lessons',
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
  const isTeacher = session?.user?.role === 'teacher';
  const links = isTeacher ? teacherLinks : studentLinks;

  return (
    <div className="flex flex-col w-64 bg-card border-r h-screen">
      {/* Logo */}
      <div className="p-6">
        <h1 className="text-2xl font-bold gradient-text">EduSync</h1>
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