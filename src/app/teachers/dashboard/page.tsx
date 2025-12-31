'use client';

import { useContext } from 'react';
import { useRouter } from 'next/navigation';
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
import { BookOpen, FileText, Library } from "lucide-react";
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function TeacherDashboard() {
  const session = useContext(SupabaseSessionContext);
  const router = useRouter();

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Loading...</h2>
          <p className="text-muted-foreground">Please wait while we load your dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Teacher Dashboard</h2>
        <p className="text-muted-foreground mb-6">Manage your lessons and resources</p>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Lesson Planning Card */}
          <Card className="dashboard-card border-t-4 border-t-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <BookOpen className="h-5 w-5" />
                Lesson Planning
              </CardTitle>
              <CardDescription>
                Create and manage your lesson plans using AI assistance.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button
                className="w-full"
                onClick={() => router.push('/teachers/lessons')}
              >
                View Lessons
              </Button>
            </CardFooter>
          </Card>

          {/* Content Generation Card */}
          <Card className="dashboard-card border-t-4 border-t-secondary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-secondary">
                <FileText className="h-5 w-5" />
                Content Generation
              </CardTitle>
              <CardDescription>
                Generate educational content and resources with AI.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="secondary" className="w-full">
                Generate Content
              </Button>
            </CardFooter>
          </Card>

          {/* Resource Management Card */}
          <Card className="dashboard-card border-t-4 border-t-accent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-accent">
                <Library className="h-5 w-5" />
                Resource Library
              </CardTitle>
              <CardDescription>
                Organize and access your teaching resources.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="outline" className="w-full">
                View Resources
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
} 