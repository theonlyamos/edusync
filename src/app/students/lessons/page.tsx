'use client';

import { useState, useEffect, useContext } from 'react';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';

export const dynamic = 'force-dynamic';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import { DashboardLayout } from '@/components/layout/DashboardLayout';

interface Lesson {
  id: string;
  title: string;
  subject: string;
  gradelevel: string;
  objectives: string;
  created_at: string;
}

export default function StudentLessonsPage() {
  const session = useContext(SupabaseSessionContext);
  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<Lesson[]>([]);

  useEffect(() => {
    fetchLessons();
  }, []);

  const fetchLessons = async () => {
    try {
      const response = await fetch('/api/students/lessons');
      if (!response.ok) throw new Error('Failed to fetch lessons');
      const data = await response.json();
      setLessons(data);
    } catch (error) {
      console.error('Error fetching lessons:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6">
        <div className="mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">My Lessons</h2>
          <p className="text-muted-foreground">Access your assigned lessons and learning materials</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-2">Loading...</h2>
              <p className="text-muted-foreground">Please wait while we load your timetable</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
            {lessons.map((lesson) => (
              <Link href={`/students/lessons/${lesson.id}`} key={lesson.id} className="min-w-0">
                <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                  <CardHeader>
                    <CardTitle className="break-words">{lesson.title}</CardTitle>
                    <CardDescription className="break-words">
                      {lesson.subject} • Grade {lesson.gradelevel}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {lesson.objectives}
                    </p>
                  </CardContent>
                  <CardFooter className="flex flex-wrap justify-between items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      Added: {new Date(lesson.created_at).toLocaleDateString()}
                    </p>
                    <span className="inline-flex min-h-11 xl:min-h-0 xl:h-8 items-center rounded-md px-3 text-xs font-medium">
                      <BookOpen className="h-4 w-4 mr-2" />
                      View Lesson
                    </span>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
        )}
        {lessons.length === 0 && !loading && (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold mb-2">No Lessons Found</h3>
            <p className="text-muted-foreground">
              You don't have any lessons assigned yet.
            </p>
          </div>
        )}


      </div>
    </DashboardLayout>
  );
}
