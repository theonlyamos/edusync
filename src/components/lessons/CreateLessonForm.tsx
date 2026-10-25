'use client';

import { MarkdownContent } from '@/components/content/MarkdownContent';
import { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { SupabaseSessionContext } from '@/components/providers/SupabaseAuthProvider';
import { GRADE_LEVELS, SUBJECTS } from '@/lib/constants';
import { subjectInGrade, type SchoolSubject } from '@/lib/school-subjects';
import { formatGradeLevel, orderGradeLevels } from '@/lib/lesson-record';
import { buildLessonSubmissionPayload, mergeGeneratedLessonDraft } from '@/lib/lesson-artifacts/authoring-ui';

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
  /** Called after a successful save, before onClose. */
  onSaved?: () => void;
  lesson?: Lesson | null;
}

export function CreateLessonForm({ onClose, onSaved, lesson }: CreateLessonFormProps) {
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
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const loading = saving || generating;
  const [generatedContent, setGeneratedContent] = useState(lesson?.content || '');
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [loadingTeacher, setLoadingTeacher] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [organizationStatus, setOrganizationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [organizationError, setOrganizationError] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmDraft, setConfirmDraft] = useState(false);

  const isEditing = !!lesson;

  // Get available subjects and grades from teacher's profile
  // The school's subject list wins when it has one: subjects taught in the
  // chosen grade, the teacher's own first. Otherwise the teacher's profile.
  const [schoolSubjects, setSchoolSubjects] = useState<SchoolSubject[]>([]);
  const [mySubjectIds, setMySubjectIds] = useState<string[]>([]);
  const availableSubjects = useMemo(() => {
    const listed = schoolSubjects.filter((s) => !s.archived && subjectInGrade(s, gradeLevel || null));
    if (listed.length) {
      const mine = listed.filter((s) => mySubjectIds.includes(s.id));
      const rest = listed.filter((s) => !mySubjectIds.includes(s.id));
      return [...mine, ...rest].map((s) => s.name);
    }
    if (teacherData?.subjects?.length) {
      return teacherData.subjects;
    }
    return SUBJECTS;
  }, [teacherData, schoolSubjects, mySubjectIds, gradeLevel]);

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    fetch('/api/teachers/subjects')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSchoolSubjects(data.subjects ?? []);
        setMySubjectIds([...new Set<string>((data.mine ?? []).map((m: { subjectId: string }) => m.subjectId))]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const currentGrade = lesson?.gradeLevel;
  const availableGrades = useMemo(() => {
    const grades: string[] = teacherData?.grades?.length ? teacherData.grades : [...GRADE_LEVELS];
    return orderGradeLevels(currentGrade ? [...grades, currentGrade] : grades);
  }, [teacherData, currentGrade]);

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
      // Lessons belong to a school; developer organizations are not offered.
      const next: Organization[] = (data.organizations ?? []).filter((organization: { type?: string }) => organization.type === 'school');
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
    setSaving(true);
    setFormError('');

    try {
      const url = isEditing ? `/api/lessons/${lesson._id}` : '/api/lessons/create';
      const method = isEditing ? 'PUT' : 'POST';

      // Edit only changes title, subject and grade; objectives and lesson text
      // are saved from the Studio and Content tab, so send their current values.
      let current = { objectives, content: generatedContent };
      if (isEditing) {
        const latest = await fetch(`/api/lessons/${lesson._id}`, { cache: 'no-store' });
        if (!latest.ok) throw new Error('Could not load the latest lesson');
        const data = await latest.json();
        current = { objectives: Array.isArray(data.objectives) ? data.objectives : String(data.objectives ?? '').split('\n').filter(Boolean), content: data.content ?? '' };
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildLessonSubmissionPayload(
          { title, subject, gradeLevel, objectives: current.objectives, content: current.content },
          isEditing ? { mode: 'edit' } : { mode: 'create', organizationId },
        )),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || (isEditing ? 'Failed to update lesson' : 'Failed to create lesson'));

      onSaved?.();
      onClose();
      if (!isEditing && result.id) router.push(`/teachers/lessons/${result.id}?tab=studio`);
    } catch (error) {
      console.error(isEditing ? 'Error updating lesson:' : 'Error creating lesson:', error);
      setFormError(error instanceof Error ? error.message : 'Could not save the lesson');
    } finally {
      setSaving(false);
    }
  };

  const hasDraftFields = Boolean(generatedContent.trim() || objectives.some((objective) => objective.trim()));
  const requestDraft = () => { if (hasDraftFields) setConfirmDraft(true); else void generateLessonContent(false); };

  /** Splits pasted lists ("1. …", "- …", one per line) into separate objectives. */
  const pasteObjectives = (index: number, event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const lines = event.clipboardData.getData('text').split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    if (lines.length < 2 || objectives[index].trim()) return;
    event.preventDefault();
    setObjectives((items) => [...items.slice(0, index), ...lines, ...items.slice(index + 1)].slice(0, 20));
  };

  const generateLessonContent = async (replaceExisting: boolean) => {
    setConfirmDraft(false);
    setGenerating(true);
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
      setGenerating(false);
    }
  };

  const canDraft = !loading && !!title && !!subject && !!gradeLevel && (isEditing || organizationStatus === 'ready');
  const detailsChanged = isEditing && (title.trim() !== lesson.title || subject !== lesson.subject || gradeLevel !== lesson.gradeLevel);

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b p-6 pr-12">
          <DialogTitle>{isEditing ? 'Edit lesson details' : 'Create a lesson'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Change the title, subject or grade. Objectives are edited in the Objective Studio, and lesson text on the Content tab.' : 'Write your objectives, or let AI draft them and the lesson text from your title and brief.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            <div className="space-y-2">
              <Label htmlFor="title">Lesson title</Label>
              <Input id="title" placeholder="e.g. Photosynthesis" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger id="subject" aria-label="Subject"><SelectValue placeholder={loadingTeacher ? 'Loading…' : 'Select subject'} /></SelectTrigger>
                  <SelectContent>
                    {[...new Set([...availableSubjects, ...(lesson?.subject ? [lesson.subject] : []), ...(subject ? [subject] : [])])].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gradeLevel">Grade</Label>
                <Select value={gradeLevel} onValueChange={setGradeLevel}>
                  <SelectTrigger id="gradeLevel" aria-label="Grade level"><SelectValue placeholder={loadingTeacher ? 'Loading…' : 'Select grade'} /></SelectTrigger>
                  <SelectContent>
                    {availableGrades.map((g) => <SelectItem key={g} value={g}>{formatGradeLevel(g)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {detailsChanged && (
              <p role="status" className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">The AI uses these details. Saving marks approved Studio materials as outdated, so they will need new versions before you publish changes.</p>
            )}

            {!isEditing && organizationStatus === 'loading' && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your school…</div>
            )}

            {!isEditing && organizationStatus === 'error' && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="text-destructive">{organizationError}</p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void loadOrganizations()}>Try again</Button>
              </div>
            )}

            {!isEditing && organizationStatus === 'ready' && organizations.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="organization">School</Label>
                <Select value={organizationId} onValueChange={setOrganizationId}>
                  <SelectTrigger id="organization"><SelectValue placeholder="Select school" /></SelectTrigger>
                  <SelectContent>
                    {organizations.map((organization) => <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isEditing && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="teacherBrief">Brief for the AI draft <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Textarea id="teacherBrief" className="min-h-20" placeholder="What should students understand? Mention standards, misconceptions, or context." value={teacherBrief} onChange={(e) => setTeacherBrief(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Learning objectives</Label>
                    <Button type="button" size="sm" variant="ghost" disabled={objectives.length >= 20} onClick={() => setObjectives((items) => [...items, ''])}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button>
                  </div>
                  <ol className="space-y-2">
                    {objectives.map((objective, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span>
                        <Textarea
                          aria-label={`Learning objective ${index + 1}`}
                          className="min-h-[2.75rem] flex-1 resize-y py-2"
                          rows={1}
                          maxLength={500}
                          value={objective}
                          onChange={(event) => setObjectives((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                          onPaste={(event) => pasteObjectives(index, event)}
                          placeholder="Students will be able to…"
                          required
                        />
                        <Button type="button" size="icon" variant="ghost" aria-label={`Remove learning objective ${index + 1}`} title="Remove objective" disabled={objectives.length === 1} onClick={() => setObjectives((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs text-muted-foreground">Tip: paste a list to add several objectives at once.</p>
                </div>

                {generatedContent && (
                  <div className="space-y-2">
                    <Label>Lesson text</Label>
                    <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-4">
                      <MarkdownContent>{generatedContent}</MarkdownContent>
                    </div>
                    <p className="text-xs text-muted-foreground">You can edit this on the lesson&apos;s Content tab after creating it.</p>
                  </div>
                )}
              </>
            )}

            {formError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError}</div>}
          </div>

          <DialogFooter className="gap-2 border-t p-4 sm:justify-between sm:space-x-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {!isEditing && (
                <Button type="button" variant="secondary" onClick={requestDraft} disabled={!canDraft}>
                  {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  {generating ? 'Drafting…' : 'Draft objectives with AI'}
                </Button>
              )}
              <Button type="submit" disabled={loading || !title.trim() || !subject || !gradeLevel || (!isEditing && objectives.some((objective) => !objective.trim())) || (!isEditing && organizationStatus !== 'ready') || (!isEditing && organizations.length > 1 && !organizationId)}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save details' : 'Create lesson'}
              </Button>
            </div>
          </DialogFooter>
        </form>

        <AlertDialog open={confirmDraft} onOpenChange={setConfirmDraft}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replace what you have written?</AlertDialogTitle>
              <AlertDialogDescription>The AI can replace your objectives and lesson text with a new draft, or only fill in the parts that are still empty. Your title stays as it is.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {(!generatedContent.trim() || !objectives.some((objective) => objective.trim())) && <Button variant="outline" onClick={() => void generateLessonContent(false)}>Fill empty parts only</Button>}
              <Button onClick={() => void generateLessonContent(true)}>Replace with new draft</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
