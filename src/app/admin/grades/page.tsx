'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, GraduationCap, BookOpen } from 'lucide-react';
import { GRADE_LEVELS } from '@/lib/constants';
import { useToast } from '@/components/ui/use-toast';

interface GradeStats {
  level: string;
  studentCount: number;
  teacherCount: number;
  lessonCount: number;
}

export default function GradesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [gradeStats, setGradeStats] = useState<GradeStats[]>([]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
    }
  }, [status, session, router]);

  useEffect(() => {
    fetchGradeStats();
  }, []);

  const fetchGradeStats = async () => {
    try {
      const response = await fetch('/api/admin/grades');
      if (!response.ok) throw new Error('Failed to fetch grade statistics');
      const data = await response.json();
      setGradeStats(data);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch grade statistics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (level: string) => {
    if (level.startsWith('primary')) {
      return 'border-t-blue-500 bg-blue-50/50';
    } else if (level.startsWith('jhs')) {
      return 'border-t-green-500 bg-green-50/50';
    } else {
      return 'border-t-purple-500 bg-purple-50/50';
    }
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2">Loading...</h2>
            <p className="text-muted-foreground">Please wait while we load the grade information</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Button
              variant="ghost"
              className="mb-4"
              onClick={() => router.push('/admin/dashboard')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-bold">Grades Overview</h1>
            <p className="text-muted-foreground">Manage and view statistics for each grade level</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {GRADE_LEVELS.map((level) => {
            const stats = gradeStats.find(stat => stat.level === level) || {
              studentCount: 0,
              teacherCount: 0,
              lessonCount: 0
            };

            return (
              <Card 
                key={level}
                className={`cursor-pointer hover:shadow-lg transition-all border-t-4 ${getGradeColor(level)}`}
                onClick={() => router.push(`/admin/grades/${level}`)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    {level.toUpperCase()}
                  </CardTitle>
                  <CardDescription>Grade level statistics and management</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{stats.studentCount} Students</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-muted-foreground" />
                      <span>{stats.teacherCount} Teachers</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span>{stats.lessonCount} Lessons</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
} 