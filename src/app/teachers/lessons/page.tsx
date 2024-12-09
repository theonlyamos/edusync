'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus } from "lucide-react";
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CreateLessonForm } from '@/components/lessons/CreateLessonForm';

interface Lesson {
  _id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  objectives: string;
  createdAt: string;
}

export default function LessonsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated' || (session?.user?.role !== 'teacher')) {
      router.push('/login');
    }
  }, [session, status, router]);

  useEffect(() => {
    fetchLessons();
  }, []);

  const fetchLessons = async () => {
    try {
      const response = await fetch('/api/lessons');
      if (!response.ok) throw new Error('Failed to fetch lessons');
      const data = await response.json();
      setLessons(data);
    } catch (error) {
      console.error('Error fetching lessons:', error);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Lessons</h2>
            <p className="text-muted-foreground">Create and manage your lessons</p>
          </div>
          <Button onClick={() => setIsCreating(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Lesson
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lessons.map((lesson) => (
            <Link href={`/teachers/lessons/${lesson._id}`} key={lesson._id}>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle>{lesson.title}</CardTitle>
                  <CardDescription>
                    {lesson.subject} • Grade {lesson.gradeLevel}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {lesson.objectives}
                  </p>
                </CardContent>
                <CardFooter>
                  <p className="text-sm text-muted-foreground">
                    Created: {new Date(lesson.createdAt).toLocaleDateString()}
                  </p>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>

        {isCreating && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50">
            <div className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] z-50">
              <CreateLessonForm
                onClose={() => {
                  setIsCreating(false);
                  fetchLessons(); // Refresh lessons after creation
                }}
              />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
} 