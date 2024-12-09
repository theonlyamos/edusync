'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { QuizContent, WorksheetContent, ExplanationContent, SummaryContent } from '@/components/content/types';
import type { 
  QuizContentType, 
  WorksheetContentType, 
  ExplanationContentType, 
  SummaryContentType 
} from '@/components/content/types';
import { useToast } from '@/components/ui/use-toast';
import { ContentActions } from '@/components/content/ContentActions';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface LessonContent {
  _id: string;
  type: 'quiz' | 'worksheet' | 'explanation' | 'summary';
  content: QuizContentType | WorksheetContentType | ExplanationContentType | SummaryContentType;
  createdAt: string;
  lessonId: string;
}

export default function ContentViewPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const contentId = params.contentId as string;
  const lessonId = params.lessonId as string;

  const [content, setContent] = useState<LessonContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchContent();
  }, [contentId]);

  const fetchContent = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/content/${contentId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch content');
      }

      const data = await response.json();
      setContent(data);
    } catch (error) {
      console.error('Error fetching content:', error);
      setError('Failed to load content. Please try again later.');
      toast({
        title: "Error",
        description: "Failed to load content. Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleContentDelete = async () => {
    if (content) {
      try {
        const response = await fetch(`/api/content/${content._id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('Failed to delete content');
        }

        toast({
          title: "Content Deleted",
          description: "The content has been successfully deleted.",
        });

        router.push(`/teachers/lessons/${lessonId}`);
      } catch (error) {
        console.error('Error deleting content:', error);
        toast({
          title: "Error",
          description: "Failed to delete content. Please try again.",
          variant: "destructive"
        });
      }
    }
  };

  const renderContent = (content: LessonContent) => {
    const contentData = content.content;
    switch (content.type) {
      case 'quiz':
        return <QuizContent content={contentData as QuizContentType} showAnswers={true} />;
      case 'worksheet':
        return <WorksheetContent content={contentData as WorksheetContentType} showSolutions={true} />;
      case 'explanation':
        return <ExplanationContent content={contentData as ExplanationContentType} />;
      case 'summary':
        return <SummaryContent content={contentData as SummaryContentType} />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <p>Loading content...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !content) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <p className="text-destructive">{error || 'Content not found'}</p>
          <Button onClick={() => router.push(`/teachers/lessons/${lessonId}`)}>
            Return to Lesson
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <Link
            href={`/teachers/lessons/${lessonId}`}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Lesson
          </Link>
        </div>

        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              {(content.content as any).title}
            </h1>
            <p className="text-muted-foreground">
              Created: {new Date(content.createdAt).toLocaleDateString()}
            </p>
          </div>
          <ContentActions
            contentId={content._id}
            contentType={content.type}
            content={renderContent(content)}
            onDelete={handleContentDelete}
            onEdit={() => router.push(`/teachers/lessons/${lessonId}`)}
          />
        </div>

        <Card>
          <CardContent className="pt-6">
            {renderContent(content)}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
} 