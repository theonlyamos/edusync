'use client';

import { useState, useEffect } from 'react';
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
import { useToast } from '@/components/ui/use-toast';
import { ContentActions } from '@/components/content/ContentActions';
import type { QuizContentType } from '@/components/content/types';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface QuizContent {
  _id: string;
  type: 'quiz';
  content: QuizContentType;
  createdAt: string;
  lessonId: string;
}

export default function QuizPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [quizzes, setQuizzes] = useState<QuizContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/content?type=quiz');
      if (!response.ok) {
        throw new Error('Failed to fetch quizzes');
      }

      const data = await response.json();
      setQuizzes(data);
    } catch (error) {
      console.error('Error fetching quizzes:', error);
      setError('Failed to load quizzes. Please try again later.');
      toast({
        title: "Error",
        description: "Failed to load quizzes. Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderQuizSummary = (quiz: QuizContent) => {
    return (
      <div className="text-sm text-muted-foreground">
        <p>{quiz.content.questions.length} Questions</p>
        <p className="mt-1">{quiz.content.description}</p>
      </div>
    );
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <p>Loading quizzes...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <p className="text-destructive">{error}</p>
          <Button onClick={fetchQuizzes}>Retry</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <Link
            href="/teachers/content"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Content Library
          </Link>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Quizzes</h1>
              <p className="text-muted-foreground">
                {quizzes.length} {quizzes.length === 1 ? 'quiz' : 'quizzes'} available
              </p>
            </div>
            <Button onClick={() => router.push('/teachers/content/quiz/create')}>
              Create New Quiz
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {quizzes.map((quiz) => (
            <Card key={quiz._id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">
                      {quiz.content.title}
                    </CardTitle>
                    <CardDescription>
                      Created: {new Date(quiz.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <ContentActions
                    contentId={quiz._id}
                    contentType={quiz.type}
                    content={renderQuizSummary(quiz)}
                    onDelete={() => fetchQuizzes()}
                    onEdit={() => router.push(`/teachers/lessons/${quiz.lessonId}/content/${quiz._id}`)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                {renderQuizSummary(quiz)}
                <div className="mt-4 flex justify-end">
                  <Link 
                    href={`/teachers/lessons/${quiz.lessonId}/content/${quiz._id}`}
                    className="inline-flex items-center"
                  >
                    <Button variant="outline">
                      View Details
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
} 