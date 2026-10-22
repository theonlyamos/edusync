'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, BookOpen, Search, Sparkles } from 'lucide-react';
import StudentInteractiveAITutor from '@/components/learn/StudentInteractiveAITutor';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { formatGrade } from '@/lib/grade';

interface Lesson {
  id: string;
  title: string;
  subject: string;
  gradelevel: string;
  objectives?: string;
}

function LessonSelector({ onSelectLesson }: { onSelectLesson: (lesson: Lesson) => void }) {
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchLessons = async () => {
      try {
        setLoading(true);
        // Only lessons published for the student's own grade.
        const response = await fetch('/api/students/lessons');
        if (response.ok) {
          const data = await response.json();
          setLessons(data.items || data || []);
        }
      } catch (error) {
        console.error('Failed to fetch lessons:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLessons();
  }, []);

  const filteredLessons = lessons.filter(lesson =>
    lesson.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lesson.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectLesson = (lesson: Lesson) => {
    router.push(`/students/lessons/${lesson.id}`);
  };

  const handleStartWithoutLesson = () => {
    // Start without a specific lesson - just navigate to the AI tutor
    router.push('/students/learn?freeform=true');
  };

  if (loading) {
    return (
      <DashboardLayout role="student">
        <div className="flex min-h-[calc(100dvh-9rem)] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading lessons...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="student">
      <div className="mx-auto max-w-4xl py-2 sm:py-8 sm:px-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2 flex items-center justify-center gap-2">
            <Sparkles className="w-7 h-7 shrink-0 text-primary sm:w-8 sm:h-8" />
            Learn with AI
          </h1>
          <p className="text-muted-foreground">
            Select a lesson to start an interactive AI tutoring session, or explore freely.
          </p>
        </div>

        {/* Freeform learning option */}
        <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 shrink-0 rounded-full bg-primary/20 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Explore Freely</h3>
                  <p className="text-sm text-muted-foreground">
                    Start learning without a specific lesson - ask about any topic!
                  </p>
                </div>
              </div>
              <Button className="min-h-11 w-full shrink-0 sm:w-auto" onClick={handleStartWithoutLesson}>
                Start Learning
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lesson search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search lessons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 pl-10 text-base sm:text-sm"
          />
        </div>

        {/* Lessons list */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold mb-3">Your Lessons</h2>
          {filteredLessons.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                {searchQuery ? 'No lessons found matching your search.' : 'No lessons available.'}
              </CardContent>
            </Card>
          ) : (
            filteredLessons.map((lesson) => (
              <Card
                key={lesson.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => handleSelectLesson(lesson)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0 break-words">
                        <h3 className="font-medium">{lesson.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {lesson.subject} {lesson.gradelevel && `· ${formatGrade(lesson.gradelevel)}`}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="min-h-11 shrink-0">
                      Learn
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function StudentLearnPageContent() {
  const searchParams = useSearchParams();
  const lessonId = searchParams.get('lessonId');
  const freeform = searchParams.get('freeform') === 'true';

  // If no lessonId and not freeform mode, show lesson selector
  if (!lessonId && !freeform) {
    return <LessonSelector onSelectLesson={() => {}} />;
  }

  // Otherwise, show the AI tutor
  return <StudentInteractiveAITutor />;
}

export default function StudentLearnPage() {
  return (
    <Suspense fallback={
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin" />
      </div>
    }>
      <StudentLearnPageContent />
    </Suspense>
  );
}
