'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Loader2, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { homeworkRequest, useHomeworkData } from '@/components/homework/shared';
import { LoadError, Loading, Notice } from '@/components/records/shared';
import type { LessonCopy, LibraryLesson } from '@/lib/lesson-library.server';
import { formatGradeLevel } from '@/lib/lesson-record';

const PREVIEW_OBJECTIVES = 3;
const PAGE = 24;

export default function LessonLibraryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const library = useHomeworkData<{ lessons: LibraryLesson[] }>('/api/teachers/lessons/library');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [copying, setCopying] = useState('');

  const lessons = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = library.data?.lessons ?? [];
    return needle ? all.filter((lesson) => [lesson.title, lesson.subject, lesson.teacherName, formatGradeLevel(lesson.gradeLevel)].some((text) => text.toLowerCase().includes(needle))) : all;
  }, [library.data, query]);

  const copy = async (lesson: LibraryLesson) => {
    setCopying(lesson.id);
    try {
      const result = await homeworkRequest<LessonCopy>('/api/teachers/lessons/library', { method: 'POST', body: JSON.stringify({ lessonId: lesson.id }) });
      const activities = `${result.copiedActivities} ${result.copiedActivities === 1 ? 'activity' : 'activities'} copied`;
      toast({
        title: `“${result.title}” is in your lessons`,
        description: result.skippedMedia ? `${activities}. Images and uploaded files were not copied, so add your own.` : `${activities}. It is a draft until you publish it.`,
      });
      router.push(`/teachers/lessons/${result.id}`);
    } catch (error) {
      toast({ title: (error as Error).message || 'Could not copy the lesson.', variant: 'destructive' });
      setCopying('');
    }
  };

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6">
        <Link href="/teachers/lessons" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to my lessons
        </Link>
        <div className="mb-6">
          <h1 className="text-2xl font-bold sm:text-3xl">School library</h1>
          <p className="mt-1 text-muted-foreground">Lessons your colleagues have published. Copy one to get your own draft to change and publish.</p>
        </div>

        {library.loading && !library.data ? (
          <Loading />
        ) : /not in a school/i.test(library.error) ? (
          <Notice>The library belongs to a school. Your account isn’t part of one yet.</Notice>
        ) : library.error || !library.data ? (
          <LoadError message={library.error || 'Could not load the school library.'} retry={() => void library.refresh()} />
        ) : library.data.lessons.length === 0 ? (
          <Notice>No colleague has published a lesson yet. Lessons appear here as soon as another teacher at your school publishes one.</Notice>
        ) : (
          <>
            <div className="mb-6 max-w-md space-y-1.5">
              <Label htmlFor="library-search">Find a lesson</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="library-search" type="search" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="Title, subject, grade or teacher" className="min-h-11 pl-9" />
              </div>
            </div>
            {lessons.length === 0 ? (
              <Notice>No lesson matches “{query.trim()}”.</Notice>
            ) : (
              <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {lessons.slice(0, shown).map((lesson) => (
                  <li key={lesson.id}>
                    <Card className="flex h-full flex-col">
                      <CardHeader className="space-y-2">
                        <CardTitle className="break-words text-lg">{lesson.title}</CardTitle>
                        <CardDescription className="break-words">{lesson.subject} • {formatGradeLevel(lesson.gradeLevel)} • {lesson.teacherName}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1">
                        {lesson.objectives.length ? (
                          <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                            {lesson.objectives.slice(0, PREVIEW_OBJECTIVES).map((objective, index) => <li key={index} className="line-clamp-2">{objective}</li>)}
                            {lesson.objectives.length > PREVIEW_OBJECTIVES && <li className="list-none text-xs">+{lesson.objectives.length - PREVIEW_OBJECTIVES} more</li>}
                          </ul>
                        ) : <p className="text-sm text-muted-foreground">No objectives listed</p>}
                      </CardContent>
                      <CardFooter>
                        <Button variant="outline" className="min-h-11 w-full" disabled={copying !== ''} onClick={() => void copy(lesson)}>
                          {copying === lesson.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                          Copy to my lessons
                        </Button>
                      </CardFooter>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            {lessons.length > shown && (
              <div className="mt-6 flex justify-center">
                <Button variant="outline" className="min-h-11" onClick={() => setShown(shown + PAGE)}>Show more lessons</Button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
