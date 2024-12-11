'use client';

import { useState, useEffect, use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ContentDisplay } from '@/components/content/ContentDisplay';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import type { 
  QuizContentType, 
  WorksheetContentType, 
  ExplanationContentType, 
  SummaryContentType 
} from '@/components/content/types';

interface LessonContent {
  _id: string;
  type: 'quiz' | 'worksheet' | 'explanation' | 'summary';
  content: QuizContentType | WorksheetContentType | ExplanationContentType | SummaryContentType;
  createdAt: string;
  lessonId: string;
}

interface Lesson {
  _id: string;
  title: string;
  subject: string;
  gradeLevel: string;
}

export default function LessonContentPage({ 
  params 
}: { 
  params: Promise<{ lessonId: string; type: string }> 
}) {
  const resolvedParams = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [contents, setContents] = useState<LessonContent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated' || (session?.user?.role !== 'student')) {
      router.push('/login');
    }
  }, [session, status, router]);

  useEffect(() => {
    fetchLesson();
    fetchContent();
  }, [resolvedParams.lessonId]);

  const fetchLesson = async () => {
    try {
      const response = await fetch(`/api/lessons/${resolvedParams.lessonId}`);
      if (!response.ok) throw new Error('Failed to fetch lesson');
      const data = await response.json();
      setLesson(data);
    } catch (error) {
      console.error('Error fetching lesson:', error);
      toast({
        title: 'Error',
        description: 'Failed to load lesson details',
        variant: 'destructive',
      });
    }
  };

  const fetchContent = async () => {
    try {
      const response = await fetch(
        `/api/content?lessonId=${resolvedParams.lessonId}&type=${resolvedParams.type}`
      );
      if (!response.ok) throw new Error('Failed to fetch content');
      const data = await response.json();
      setContents(data);
    } catch (error) {
      console.error('Error fetching content:', error);
      toast({
        title: 'Error',
        description: 'Failed to load lesson content',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!lesson) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">Lesson not found</h2>
          <Button onClick={() => router.push('/students/lessons')}>
            Back to Lessons
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <Button 
            variant="outline" 
            onClick={() => router.push(`/students/lessons/${resolvedParams.lessonId}`)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Lesson
          </Button>
          <h2 className="text-2xl font-bold">
            {lesson.title} - {resolvedParams.type.charAt(0).toUpperCase() + resolvedParams.type.slice(1)}s
          </h2>
          <p className="text-muted-foreground">
            {lesson.subject} • Grade {lesson.gradeLevel}
          </p>
        </div>

        <div className="space-y-6">
          {contents.map((content) => (
            <Card key={content._id}>
              <CardHeader>
                <CardTitle>{content.content.title}</CardTitle>
                <CardDescription>
                  Added {new Date(content.createdAt).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ContentDisplay
                  type={content.type}
                  content={content.content}
                  showAnswers={false}
                />
              </CardContent>
            </Card>
          ))}

          {contents.length === 0 && (
            <Card>
              <CardContent className="p-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-2">No Content Available</h3>
                  <p className="text-muted-foreground">
                    This lesson doesn't have any {resolvedParams.type}s yet.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
} 