'use client';

import { BookOpen, GraduationCap } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Lesson } from './types';
import { getLessonId } from './types';

interface LessonContextPanelProps {
  gradeLevel: string | null;
  lessons: Lesson[];
  selectedLesson: string | null;
  disabled?: boolean;
  onLessonChange: (lessonId?: string) => void;
}

export function LessonContextPanel({
  gradeLevel,
  lessons,
  selectedLesson,
  disabled,
  onLessonChange,
}: LessonContextPanelProps) {
  const selectedLessonTitle = lessons.find((lesson) => getLessonId(lesson) === selectedLesson)?.title;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Study Context</h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          {gradeLevel && (
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              <span>Grade Level: {gradeLevel}</span>
            </div>
          )}
          {selectedLessonTitle && (
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span className="truncate">Lesson: {selectedLessonTitle}</span>
            </div>
          )}
        </div>
      </div>

      <Select value={selectedLesson || 'general'} onValueChange={(value) => onLessonChange(value === 'general' ? undefined : value)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Select a lesson" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="general">General study session</SelectItem>
          {lessons.map((lesson) => {
            const lessonId = getLessonId(lesson);

            return (
              <SelectItem key={lessonId} value={lessonId}>
                {lesson.title} - {lesson.subject}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
