'use client';

import { useState, useEffect, useContext } from 'react';

import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import {
  Users,
  GraduationCap,
  BookOpen,
  School,
  UserPlus,
  Settings,
  Shield,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

interface Stats {
  totalUsers: number;
  totalStudents: number;
  totalTeachers: number;
  totalAdmins: number;
  totalLessons: number;
  activeUsers: number;
}

export default function AdminDashboard() {
  const session = useContext(SupabaseSessionContext);
  const router = useRouter();
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalStudents: 0,
    totalTeachers: 0,
    totalAdmins: 0,
    totalLessons: 0,
    activeUsers: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {

    const fetchStats = async () => {
      try {
        const response = await fetch('/api/admin/users/stats');
        if (!response.ok) throw new Error('Failed to fetch stats');
        const data = await response.json();
        setStats(data);
      } catch (error) {
        console.error('Error fetching stats:', error);
        toast({
          title: 'Error',
          description: 'Failed to load dashboard statistics',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (!session) {
    return null; // Or unauthorized component
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">
              Manage your educational platform
            </p>
          </div>
          <Button onClick={() => router.push('/admin/settings')}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-6 mb-8 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total Users
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mb-1" />
              ) : (
                <div className="text-2xl font-bold">{stats.totalUsers}</div>
              )}
              <p className="text-xs text-muted-foreground">
                All registered users
              </p>
            </CardContent>
          </Card>

          <Link href="/admin/users/admins" className="block h-full">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Admins
                </CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mb-1" />
                ) : (
                  <div className="text-2xl font-bold">{stats.totalAdmins}</div>
                )}
                <p className="text-xs text-muted-foreground">
                  System administrators
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/users/students" className="block h-full">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Students
                </CardTitle>
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mb-1" />
                ) : (
                  <div className="text-2xl font-bold">{stats.totalStudents}</div>
                )}
                <p className="text-xs text-muted-foreground">
                  Enrolled students
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/users/teachers" className="block h-full">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Teachers
                </CardTitle>
                <School className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mb-1" />
                ) : (
                  <div className="text-2xl font-bold">{stats.totalTeachers}</div>
                )}
                <p className="text-xs text-muted-foreground">
                  Active teachers
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/lessons" className="block h-full">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Lessons
                </CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mb-1" />
                ) : (
                  <div className="text-2xl font-bold">{stats.totalLessons}</div>
                )}
                <p className="text-xs text-muted-foreground">
                  Created lessons
                </p>
              </CardContent>
            </Card>
          </Link>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Active Users
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mb-1" />
              ) : (
                <div className="text-2xl font-bold">{stats.activeUsers}</div>
              )}
              <p className="text-xs text-muted-foreground">
                Currently online
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="lessons">Lessons</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">User Management</h2>
              <Button onClick={() => router.push('/admin/users/create')}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Teachers</CardTitle>
                  <CardDescription>
                    Manage teacher accounts and permissions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push('/admin/users/teachers')}
                  >
                    Manage Teachers
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Students</CardTitle>
                  <CardDescription>
                    Manage student accounts and enrollments
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push('/admin/users/students')}
                  >
                    Manage Students
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="lessons" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Lesson Management</CardTitle>
                <CardDescription>
                  Overview and management of all lessons
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push('/admin/lessons')}
                >
                  View All Lessons
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System Reports</CardTitle>
                <CardDescription>
                  View and generate system reports
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push('/admin/reports')}
                >
                  View Reports
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
} 