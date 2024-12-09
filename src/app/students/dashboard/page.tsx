'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookOpen, Brain, MessagesSquare } from "lucide-react";
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function StudentDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated' || (session?.user?.role !== 'student')) {
      router.push('/login');
    }
  }, [session, status, router]);

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <DashboardLayout>
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Student Dashboard</h2>
        <p className="text-muted-foreground mb-6">Access your learning resources</p>
        
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Current Lessons Card */}
          <Card className="dashboard-card border-t-4 border-t-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <BookOpen className="h-5 w-5" />
                My Lessons
              </CardTitle>
              <CardDescription>
                Access your current lessons and materials.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button className="w-full">
                View Lessons
              </Button>
            </CardFooter>
          </Card>

          {/* Practice Exercises Card */}
          <Card className="dashboard-card border-t-4 border-t-secondary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-secondary">
                <Brain className="h-5 w-5" />
                Practice Exercises
              </CardTitle>
              <CardDescription>
                Generate and solve practice problems.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="secondary" className="w-full">
                Start Practice
              </Button>
            </CardFooter>
          </Card>

          {/* AI Tutor Card */}
          <Card className="dashboard-card border-t-4 border-t-accent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-accent">
                <MessagesSquare className="h-5 w-5" />
                AI Tutor
              </CardTitle>
              <CardDescription>
                Get personalized explanations and help.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="outline" className="w-full">
                Ask AI Tutor
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
} 