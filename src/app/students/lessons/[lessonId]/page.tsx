'use client';

import { useState, useEffect, use, useCallback, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
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
import { CircleHelp, ExternalLink, FileText, Link as LinkIcon, Loader2, Play, Presentation, Sparkles, Target } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { FloatingActionButton } from '@/components/ui/floating-action-button';
import type { 
  QuizContentType, 
  WorksheetContentType, 
  ExplanationContentType, 
  SummaryContentType 
} from '@/components/content/types';
import type { StudentLessonDetail } from '@/lib/lesson-artifacts/student-learning';

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

export default function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const resolvedParams = use(params);
  const session = useContext(SupabaseSessionContext);
  const router = useRouter();
  const { toast } = useToast();
  const [lessonDetail, setLessonDetail] = useState<StudentLessonDetail | null>(null);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [contents, setContents] = useState<LessonContent[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [practicing, setPracticing] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [generatingPractice, setGeneratingPractice] = useState(false);
  const lesson = lessonDetail?.lesson ?? null;

  const fetchLesson = useCallback(async () => {
    try {
      setLoading(true);
      setLessonError(null);
      const response = await fetch(`/api/students/lessons/${resolvedParams.lessonId}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Failed to fetch lesson');
      setLessonDetail(body as StudentLessonDetail);
      return true;
    } catch (error) {
      console.error('Error fetching lesson:', error);
      setLessonError(error instanceof Error ? error.message : 'Failed to load lesson details');
      return false;
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.lessonId]);

  const fetchContent = useCallback(async () => {
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
  }, [resolvedParams.lessonId, toast]);

  const fetchResources = useCallback(async () => {
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
  }, [resolvedParams.lessonId, toast]);

  useEffect(() => {
    if (resolvedParams.lessonId) {
      void (async () => {
        const authorized = await fetchLesson();
        if (authorized) await Promise.all([fetchContent(), fetchResources()]);
      })();
    }
  }, [fetchContent, fetchLesson, fetchResources, resolvedParams.lessonId]);

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
          lessonId: lesson.id,
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

  const handleLearnWithAI = (objectiveId?: string) => {
    if (!lesson) return;
    const selectedObjectiveId = objectiveId ?? lessonDetail?.objectives[0]?.id;
    if (!selectedObjectiveId) return;
    const params = new URLSearchParams({
      lessonId: resolvedParams.lessonId,
      objectiveId: selectedObjectiveId,
    });
    router.push(`/students/learn?${params.toString()}`);
  };

  if (loading || !session) {
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
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center p-6">
          <Card className="w-full border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
            <CardHeader>
              <CardTitle>Lesson unavailable</CardTitle>
              <CardDescription>{lessonError || 'This lesson could not be found.'}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button onClick={fetchLesson}>Try again</Button>
              <Button variant="outline" onClick={() => window.location.assign('/students/lessons')}>Back to lessons</Button>
            </CardContent>
          </Card>
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

              <TabsContent value="overview" className="space-y-6">
                <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white shadow-sm">
                  <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-end">
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">
                        <Target className="h-4 w-4" /> Objective roadmap
                      </div>
                      <h3 className="max-w-2xl text-2xl font-semibold leading-tight">Learn one clear outcome at a time.</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Each tutor session stays focused on one objective and uses your teacher&apos;s reviewed activities before creating anything new.</p>
                    </div>
                    <Button className="bg-lime-300 text-slate-950 hover:bg-lime-200" onClick={() => handleLearnWithAI()} disabled={!lessonDetail?.objectives.length}>
                      <Play className="mr-2 h-4 w-4 fill-current" /> Start lesson with AI
                    </Button>
                  </div>
                </section>

                <div className="space-y-3">
                  {lessonDetail?.objectives.map((objective, index) => (
                    <Card key={objective.id} className="group overflow-hidden transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700">
                      <CardContent className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-lime-300 shadow-sm dark:bg-lime-300 dark:text-slate-950">{String(index + 1).padStart(2, '0')}</div>
                        <div className="min-w-0">
                          <p className="font-medium leading-6 text-foreground">{objective.text}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1"><Presentation className="h-3.5 w-3.5" />{objective.artifactCounts.visualizations} visual{objective.artifactCounts.visualizations === 1 ? '' : 's'}</span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1"><CircleHelp className="h-3.5 w-3.5" />{objective.artifactCounts.quizzes} quiz{objective.artifactCounts.quizzes === 1 ? '' : 'zes'}</span>
                          </div>
                        </div>
                        <Button variant="outline" className="w-full sm:w-auto" onClick={() => handleLearnWithAI(objective.id)}>
                          <Sparkles className="mr-2 h-4 w-4" /> Start AI tutor
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {!lessonDetail?.objectives.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No published objectives are available for this lesson.</p>}
                </div>
                {lesson.content && (
                  <div>
                    <h3 className="font-semibold mb-2">Content</h3>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{typeof lesson.content === 'string' ? lesson.content : JSON.stringify(lesson.content)}</ReactMarkdown>
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
      
      {/* Learn with AI FAB */}
      {lesson && (
        <FloatingActionButton
          icon={<Sparkles className="w-5 h-5" />}
          label="Learn with AI"
          onClick={() => handleLearnWithAI()}
        />
      )}
    </DashboardLayout>
  );
}
