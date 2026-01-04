'use client';

import { useState, useEffect, useContext, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Wand2, X } from "lucide-react";
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { GRADE_LEVELS, SUBJECTS } from '@/lib/constants';

interface Teacher {
  subjects?: string[];
  grades?: string[];
}

interface Lesson {
  _id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  objectives: string;
  content: string;
}

interface CreateLessonFormProps {
  onClose: () => void;
  lesson?: Lesson | null;
}

export function CreateLessonForm({ onClose, lesson }: CreateLessonFormProps) {
  const session = useContext(SupabaseSessionContext);
  const [title, setTitle] = useState(lesson?.title || '');
  const [subject, setSubject] = useState(lesson?.subject || '');
  const [gradeLevel, setGradeLevel] = useState(lesson?.gradeLevel || '');
  const [objectives, setObjectives] = useState(lesson?.objectives || '');
  const [loading, setLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState(lesson?.content || '');
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [loadingTeacher, setLoadingTeacher] = useState(false);

  const isEditing = !!lesson;

  // Get available subjects and grades from teacher's profile
  const availableSubjects = useMemo(() => {
    if (teacherData?.subjects?.length) {
      return teacherData.subjects;
    }
    return SUBJECTS;
  }, [teacherData]);

  const availableGrades = useMemo(() => {
    if (teacherData?.grades?.length) {
      return teacherData.grades;
    }
    return GRADE_LEVELS;
  }, [teacherData]);

  useEffect(() => {
    // Fetch teacher's subjects and grades
    const fetchTeacherData = async () => {
      if (!session?.user?.id) return;

      setLoadingTeacher(true);
      try {
        const response = await fetch('/api/teachers/profile');
        if (response.ok) {
          const data = await response.json();
          setTeacherData({
            subjects: data.subjects || [],
            grades: data.grades || [],
          });
        }
      } catch (error) {
        console.error('Error fetching teacher data:', error);
      } finally {
        setLoadingTeacher(false);
      }
    };

    fetchTeacherData();
  }, [session?.user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = isEditing ? `/api/lessons/${lesson._id}` : '/api/lessons/create';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          subject,
          gradeLevel,
          objectives,
          content: generatedContent,
        }),
      });

      if (!response.ok) {
        throw new Error(isEditing ? 'Failed to update lesson' : 'Failed to create lesson');
      }

      onClose();
    } catch (error) {
      console.error(isEditing ? 'Error updating lesson:' : 'Error creating lesson:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateLessonContent = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/lessons/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          subject,
          gradeLevel,
          objectives,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate lesson content');
      }

      const data = await response.json();
      setGeneratedContent(data.content);
    } catch (error) {
      console.error('Error generating lesson content:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{isEditing ? 'Edit Lesson' : 'Create New Lesson'}</CardTitle>
            <CardDescription>
              {isEditing ? 'Update lesson details or regenerate content' : 'Fill in the lesson details or use AI to generate content'}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <CardContent className="space-y-4 flex-1 overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="title">Lesson Title</Label>
            <Input
              id="title"
              placeholder="Enter lesson title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Select
                value={subject}
                onValueChange={setSubject}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingTeacher ? "Loading..." : "Select subject"} />
                </SelectTrigger>
                <SelectContent>
                  {availableSubjects.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gradeLevel">Grade Level</Label>
              <Select
                value={gradeLevel}
                onValueChange={setGradeLevel}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingTeacher ? "Loading..." : "Select grade level"} />
                </SelectTrigger>
                <SelectContent>
                  {availableGrades.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="objectives">Learning Objectives</Label>
            <textarea
              id="objectives"
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter the learning objectives for this lesson"
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              required
            />
          </div>

          {generatedContent && (
            <div className="space-y-2">
              <Label>Lesson Content</Label>
              <div className="rounded-md border bg-muted p-4">
                <pre className="text-sm whitespace-pre-wrap">
                  {generatedContent}
                </pre>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={generateLessonContent}
              disabled={loading || !title || !subject || !gradeLevel || !objectives}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              {isEditing ? 'Regenerate Content' : 'Generate with AI'}
            </Button>
            <Button type="submit" disabled={loading || !generatedContent}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                isEditing ? 'Update Lesson' : 'Create Lesson'
              )}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}