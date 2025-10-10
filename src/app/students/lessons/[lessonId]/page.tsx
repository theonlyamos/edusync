'use client';

import { useState, useEffect, use } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { PracticeExercise } from '@/components/practice/PracticeExercise';
import { ContentDisplay } from '@/components/content/ContentDisplay';
import { Loader2, FileText, Link as LinkIcon, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import type { 
  QuizContentType, 
  WorksheetContentType, 
  ExplanationContentType, 
  SummaryContentType 
} from '@/components/content/types';

interface Resource {
  _id: string;
  title: string;
  description: string;
  type: 'file' | 'url';
  fileUrl?: string;
  filename?: string;
  url?: string;
  originalUrl?: string;
  lessonId: string;
  createdAt: string;
}

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
  objectives: string;
  content: string;
}

export default function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const resolvedParams = use(params);
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [contents, setContents] = useState<LessonContent[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [practicing, setPracticing] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [generatingPractice, setGeneratingPractice] = useState(false);

  useEffect(() => {
    if (resolvedParams.lessonId) {
      fetchLesson();
      fetchContent();
      fetchResources();
    }
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
    } finally {
      setLoading(false);
    }
  };

  const fetchContent = async () => {
    try {
      const response = await fetch(`/api/content?lessonId=${resolvedParams.lessonId}`);
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
    }
  };

  const fetchResources = async () => {
    try {
      const response = await fetch(`/api/resources?lessonId=${resolvedParams.lessonId}`);
      if (!response.ok) throw new Error('Failed to fetch resources');
      const data = await response.json();
      setResources(data);
    } catch (error) {
      console.error('Error fetching resources:', error);
      toast({
        title: 'Error',
        description: 'Failed to load lesson resources',
        variant: 'destructive',
      });
    }
  };

  const handleStartPractice = async (isRetry = false) => {
    if (!lesson) return;

    if (!isRetry) {
      setGeneratingPractice(true);
    }
    
    setPracticing(false);
    setQuestions([]);

    try {
      const response = await fetch('/api/students/practice/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lessonId: lesson._id,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate practice');

      const data = await response.json();
      
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setPracticing(true);
      } else {
        toast({ title: 'No questions generated', description: 'Could not generate practice questions.', variant: 'destructive' })
      }
      
    } catch (error) {
      console.error('Error generating practice:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate practice exercises',
        variant: 'destructive',
      });
    } finally {
       if (!isRetry) {
         setGeneratingPractice(false);
       }
    }
  };

  const handleRetry = () => {
    setPracticing(false);
    setTimeout(() => setPracticing(true), 0); 
  };

  const handleGenerateNew = () => {
    handleStartPractice();
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
          <Button onClick={() => window.location.assign('/students/lessons')}>
            Back to Lessons
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  if (practicing) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-4xl mx-auto">
          <div className="mb-6">
            <Button 
              variant="outline" 
              onClick={() => setPracticing(false)}
              className="mb-4"
            >
              Back to Lesson
            </Button>
            <h2 className="text-2xl font-bold">{lesson.title} - Practice</h2>
          </div>
          {questions.length > 0 ? (
            <PracticeExercise
              subject={lesson.subject}
              topic={lesson.title}
              questions={questions}
              onRetry={handleRetry}
              onGenerateNew={handleGenerateNew}
            />
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <p>Loading questions or no questions generated.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>{lesson.title}</CardTitle>
            <CardDescription>
              {lesson.subject} • Grade {lesson.gradeLevel}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="resources">Resources</TabsTrigger>
                <TabsTrigger value="practice">Practice</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Learning Objectives</h3>
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{lesson.objectives}</ReactMarkdown>
                  </div>
                </div>
                {lesson.content && (
                  <div>
                    <h3 className="font-semibold mb-2">Content</h3>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{lesson.content}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="content" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {['quiz', 'worksheet', 'explanation', 'summary'].map((type) => {
                    const typeContents = contents.filter(c => c.type === type);
                    return (
                      <Card 
                        key={type}
                        className="cursor-pointer hover:shadow-lg transition-all duration-300"
                        onClick={() => {
                          if (typeContents.length > 0) {
                            router.push(`/students/lessons/${resolvedParams.lessonId}/content/${type}`);
                          }
                        }}
                      >
                        <CardHeader>
                          <CardTitle className="capitalize flex items-center gap-2">
                            {type === 'quiz' && <FileText className="h-5 w-5 text-blue-500" />}
                            {type === 'worksheet' && <FileText className="h-5 w-5 text-green-500" />}
                            {type === 'explanation' && <FileText className="h-5 w-5 text-purple-500" />}
                            {type === 'summary' && <FileText className="h-5 w-5 text-orange-500" />}
                            {type}
                          </CardTitle>
                          <CardDescription>
                            {typeContents.length} {type}{typeContents.length !== 1 ? 's' : ''}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            {typeContents.length === 0 ? (
                              'No content available'
                            ) : (
                              `Click to view ${typeContents.length} ${type}${typeContents.length !== 1 ? 's' : ''}`
                            )}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="resources" className="space-y-4">
                {resources.map((resource) => (
                  <Card key={resource._id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-semibold mb-2">{resource.title}</h3>
                          <p className="text-muted-foreground mb-4">{resource.description}</p>
                          {resource.type === 'file' && resource.fileUrl && (
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              <Link 
                                href={resource.fileUrl} 
                                target="_blank"
                                className="text-primary hover:underline"
                              >
                                {resource.filename}
                                <ExternalLink className="h-3 w-3 inline ml-1" />
                              </Link>
                            </div>
                          )}
                          {resource.type === 'url' && resource.url && (
                            <div className="flex items-center gap-2">
                              <LinkIcon className="h-4 w-4" />
                              <Link 
                                href={resource.url} 
                                target="_blank"
                                className="text-primary hover:underline"
                              >
                                {resource.originalUrl || 'View Resource'}
                                <ExternalLink className="h-3 w-3 inline ml-1" />
                              </Link>
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground mt-4">
                            Added {new Date(resource.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {resources.length === 0 && (
                  <div className="text-center py-12">
                    <h3 className="text-lg font-semibold mb-2">No Resources Available</h3>
                    <p className="text-muted-foreground">
                      This lesson doesn't have any resources yet.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="practice" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Practice Exercises</CardTitle>
                    <CardDescription>
                      Test your understanding of the lesson material
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      onClick={() => handleStartPractice()}
                      disabled={generatingPractice}
                    >
                      {generatingPractice ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating Practice...
                        </>
                      ) : (
                        'Start Practice'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
} 