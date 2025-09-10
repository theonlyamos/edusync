'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useContext } from 'react';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';

export const dynamic = 'force-dynamic';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookOpen, Brain, MessagesSquare, Trophy, Clock, FileText } from "lucide-react";
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function StudentDashboard() {
  const session = useContext(SupabaseSessionContext);
  const router = useRouter();

  useEffect(() => {
    if (!session || (session?.user?.role !== 'student')) {
      router.push('/login');
    }
  }, [session, router]);

  if (!session) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-foreground">Welcome back, {session?.user?.name}!</h2>
          <p className="text-muted-foreground">Here's an overview of your learning journey</p>
        </div>
        
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
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm">
                  <Clock className="h-4 w-4 inline mr-2" />
                  Last accessed: 2 hours ago
                </p>
                <p className="text-sm">
                  <FileText className="h-4 w-4 inline mr-2" />
                  3 lessons in progress
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full"
                onClick={() => router.push('/students/lessons')}
              >
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
                Test your knowledge with interactive exercises.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm">
                  <Trophy className="h-4 w-4 inline mr-2" />
                  Completed: 12 exercises
                </p>
                <p className="text-sm">
                  <Clock className="h-4 w-4 inline mr-2" />
                  Average score: 85%
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                variant="secondary" 
                className="w-full"
                onClick={() => router.push('/students/practice')}
              >
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
                Get personalized help and explanations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm">
                  <Clock className="h-4 w-4 inline mr-2" />
                  Available 24/7
                </p>
                <p className="text-sm">
                  <MessagesSquare className="h-4 w-4 inline mr-2" />
                  Unlimited questions
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => router.push('/students/tutor')}
              >
                Ask AI Tutor
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Recent Activity Section */}
        <div className="mt-8">
          <h3 className="text-xl font-semibold mb-4">Recent Activity</h3>
          <div className="bg-card border rounded-lg p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-2 rounded-full">
                  <BookOpen className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Completed Lesson: Introduction to Algebra</p>
                  <p className="text-sm text-muted-foreground">2 hours ago</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-secondary/10 p-2 rounded-full">
                  <Brain className="h-4 w-4 text-secondary" />
                </div>
                <div>
                  <p className="font-medium">Practice Quiz: Quadratic Equations</p>
                  <p className="text-sm text-muted-foreground">Yesterday</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-accent/10 p-2 rounded-full">
                  <MessagesSquare className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <p className="font-medium">AI Tutor Session: Understanding Derivatives</p>
                  <p className="text-sm text-muted-foreground">2 days ago</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
} 