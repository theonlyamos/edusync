'use client';

import { useState, useEffect, useContext } from 'react';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';

export const dynamic = 'force-dynamic';
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
import { BookOpen, FileText, Library } from "lucide-react";
import { DashboardLayout } from '@/components/layout/DashboardLayout';

interface Lesson {
  _id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  objectives: string;
  createdAt: string;
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
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-foreground">My Lessons</h2>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lessons.map((lesson) => (
              <Link href={`/students/lessons/${lesson._id}`} key={lesson._id}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
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
                  <CardFooter className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Added: {new Date(lesson.createdAt).toLocaleDateString()}
                    </p>
                    <Button variant="ghost" size="sm">
                      <BookOpen className="h-4 w-4 mr-2" />
                      View Lesson
                    </Button>
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