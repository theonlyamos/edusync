'use client';

import { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
import { Loader2, Plus, Trash2, Wand2, X } from "lucide-react";
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { GRADE_LEVELS, SUBJECTS } from '@/lib/constants';
import { mergeGeneratedLessonDraft } from '@/lib/lesson-artifacts/authoring-ui';

interface Teacher {
  subjects?: string[];
  grades?: string[];
}

interface Organization {
  id: string;
  name: string;
}

interface Lesson {
  _id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  objectives: string | string[];
  content: string;
}

interface CreateLessonFormProps {
  onClose: () => void;
  lesson?: Lesson | null;
}

export function CreateLessonForm({ onClose, lesson }: CreateLessonFormProps) {
  const router = useRouter();
  const session = useContext(SupabaseSessionContext);
  const [title, setTitle] = useState(lesson?.title || '');
  const [subject, setSubject] = useState(lesson?.subject || '');
  const [gradeLevel, setGradeLevel] = useState(lesson?.gradeLevel || '');
  const [objectives, setObjectives] = useState<string[]>(
    Array.isArray(lesson?.objectives)
      ? lesson.objectives
      : lesson?.objectives
        ? lesson.objectives.split('\n').filter(Boolean)
        : [''],
  );
  const [teacherBrief, setTeacherBrief] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState(lesson?.content || '');
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [loadingTeacher, setLoadingTeacher] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [organizationStatus, setOrganizationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [organizationError, setOrganizationError] = useState('');
  const [formError, setFormError] = useState('');

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

  const loadOrganizations = useCallback(async () => {
    if (!session?.user?.id || isEditing) return;
    setOrganizationStatus('loading');
    setOrganizationError('');
    try {
      const response = await fetch('/api/organizations');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load your organizations');
      const next: Organization[] = data.organizations ?? [];
      setOrganizations(next);
      setOrganizationId((current) => current || (next.length === 1 ? next[0].id : ''));
      setOrganizationStatus('ready');
    } catch (error) {
      setOrganizations([]);
      setOrganizationStatus('error');
      setOrganizationError(error instanceof Error ? error.message : 'Could not load your organizations');
    }
  }, [session?.user?.id, isEditing]);

  useEffect(() => { queueMicrotask(() => void loadOrganizations()); }, [loadOrganizations]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError('');

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
          organizationId: organizationId || null,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || (isEditing ? 'Failed to update lesson' : 'Failed to create lesson'));

      onClose();
      if (!isEditing && result.id) router.push(`/teachers/lessons/${result.id}?tab=studio`);
    } catch (error) {
      console.error(isEditing ? 'Error updating lesson:' : 'Error creating lesson:', error);
      setFormError(error instanceof Error ? error.message : 'Could not save the lesson');
    } finally {
      setLoading(false);
    }
  };

  const generateLessonContent = async () => {
    const hasExistingGeneratedFields = generatedContent.trim() || objectives.some((objective) => objective.trim());
    const replaceExisting = Boolean(hasExistingGeneratedFields) && window.confirm('Replace your current objectives and lesson content with a new AI draft? Choose Cancel to preserve them and fill only fields that are still empty. Your title will always be preserved.');
    if (hasExistingGeneratedFields && !replaceExisting && generatedContent.trim() && objectives.some((objective) => objective.trim())) return;
    setLoading(true);
    setFormError('');
    try {
      const response = await fetch('/api/teachers/lessons/generate-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          subject,
          gradeLevel,
          teacherBrief,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to generate lesson content');
      const merged = mergeGeneratedLessonDraft({
        current: { title, objectives, content: generatedContent },
        generated: { title: data.title, objectives: data.objectives, content: data.content },
        replaceExisting,
      });
      setTitle(merged.title);
      setObjectives(merged.objectives);
      setGeneratedContent(merged.content);
    } catch (error) {
      console.error('Error generating lesson content:', error);
      setFormError(error instanceof Error ? error.message : 'Could not generate the lesson draft');
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
            type="button"
            aria-label="Close lesson form"
            title="Close"
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
                <SelectTrigger id="subject" aria-label="Subject">
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
                <SelectTrigger id="gradeLevel" aria-label="Grade level">
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

          {!isEditing && organizationStatus === 'loading' && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading organization access…</div>
          )}

          {!isEditing && organizationStatus === 'error' && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="text-destructive">{organizationError}</p>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void loadOrganizations()}>Try again</Button>
            </div>
          )}

          {!isEditing && organizationStatus === 'ready' && organizations.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Select value={organizationId} onValueChange={setOrganizationId}>
                <SelectTrigger id="organization"><SelectValue placeholder="Select organization" /></SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="teacherBrief">Teacher brief <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <textarea
              id="teacherBrief"
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="What should students understand? Mention standards, misconceptions, or context."
              value={teacherBrief}
              onChange={(e) => setTeacherBrief(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Learning Objectives</Label>
              <Button type="button" size="sm" variant="ghost" onClick={() => setObjectives((items) => [...items, ''])}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button>
            </div>
            <div className="space-y-2">
              {objectives.map((objective, index) => (
                <div key={index} className="flex gap-2">
                  <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span>
                  <Input
                    aria-label={`Learning objective ${index + 1}`}
                    value={objective}
                    onChange={(event) => setObjectives((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                    placeholder="Students will be able to…"
                    required
                  />
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove learning objective ${index + 1}`} title="Remove objective" disabled={objectives.length === 1} onClick={() => setObjectives((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
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

          {formError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError}</div>}
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
              disabled={loading || !title || !subject || !gradeLevel || (!isEditing && organizationStatus !== 'ready')}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              {isEditing ? 'Regenerate Draft' : 'Generate Draft'}
            </Button>
            <Button type="submit" disabled={loading || !generatedContent || objectives.some((objective) => !objective.trim()) || (!isEditing && organizationStatus !== 'ready') || (organizations.length > 1 && !organizationId)}>
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
