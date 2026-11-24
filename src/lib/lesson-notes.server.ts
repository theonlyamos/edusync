import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server';
import type { ServiceSupabase } from '@/lib/school-access.server';
import { sanitizeLessonNotes, type LessonNotes } from '@/lib/whiteboard/board';

export class LessonNotesError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function lessonNotesFailure(error: unknown, fallback: string, where: string) {
  if (error instanceof LessonNotesError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`[${where}]`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export type LessonNotesActor = { supabase: ServiceSupabase; userId: string };

/** Saved notes belong to signed-in students. */
export async function requireNotesStudent(): Promise<LessonNotesActor> {
  const session = await getServerSession();
  if (!session?.user) throw new LessonNotesError('Unauthorized', 401);
  if (session.user.role !== 'student') throw new LessonNotesError('Lesson notes are for students', 403);
  return { supabase: createServerSupabase(), userId: session.user.id };
}

/** Largest request body accepted for one save. The stored notes are smaller once cleaned. */
export const LESSON_NOTES_MAX_BYTES = 600_000;
/** Kept under the size the table allows, with room for characters that take more than one byte. */
const LESSON_NOTES_STORED_MAX = 130_000;
/** How many sets of notes the list shows, newest first. */
export const LESSON_NOTES_LIST_LIMIT = 100;

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export type LessonNotesSummary = {
  id: string;
  topic: string;
  createdAt: string;
  boards: number;
  cards: number;
  checksCorrect: number;
  checksAnswered: number;
};

const SUMMARY = 'id, topic, created_at, boards, cards, checks_correct, checks_answered';
type SummaryRow = { id: string; topic: string; created_at: string; boards: number; cards: number; checks_correct: number; checks_answered: number };
const toSummary = (row: SummaryRow): LessonNotesSummary => ({
  id: row.id,
  topic: row.topic,
  createdAt: row.created_at,
  boards: row.boards,
  cards: row.cards,
  checksCorrect: row.checks_correct,
  checksAnswered: row.checks_answered,
});

/** Saves (or replaces) the notes of one of the student's own tutor sessions. */
export async function saveLessonNotes({ supabase, userId }: LessonNotesActor, sessionId: string, body: unknown): Promise<{ id: string }> {
  if (!isUuid(sessionId)) throw new LessonNotesError('Session not found', 404);
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const notes = sanitizeLessonNotes(input.notes);
  if (!notes) throw new LessonNotesError('There is nothing to save yet.');

  const { data: session, error: sessionError } = await supabase.from('learning_sessions').select('id, user_id, topic').eq('id', sessionId).maybeSingle();
  if (sessionError) throw sessionError;
  // Someone else's session reads the same as a missing one.
  if (!session || session.user_id !== userId) throw new LessonNotesError('Session not found', 404);

  const stored = { pages: notes.pages, cards: notes.cards };
  if (JSON.stringify(stored).length > LESSON_NOTES_STORED_MAX) throw new LessonNotesError('These notes are too large to save.', 413);

  const topic = (typeof input.topic === 'string' ? input.topic : session.topic ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const { data, error } = await supabase
    .from('lesson_notes')
    .upsert({
      student_id: userId,
      learning_session_id: sessionId,
      topic,
      notes: stored,
      boards: notes.pages.length,
      cards: notes.cards.length,
      checks_correct: notes.score.correct,
      checks_answered: notes.score.answered,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'learning_session_id' })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

export async function listLessonNotes({ supabase, userId }: LessonNotesActor): Promise<LessonNotesSummary[]> {
  const { data, error } = await supabase.from('lesson_notes').select(SUMMARY).eq('student_id', userId).order('created_at', { ascending: false }).limit(LESSON_NOTES_LIST_LIMIT);
  if (error) throw error;
  return ((data ?? []) as SummaryRow[]).map(toSummary);
}

export async function getLessonNotes({ supabase, userId }: LessonNotesActor, id: string): Promise<LessonNotesSummary & { notes: LessonNotes }> {
  if (!isUuid(id)) throw new LessonNotesError('Notes not found', 404);
  const { data, error } = await supabase.from('lesson_notes').select(`${SUMMARY}, notes`).eq('id', id).eq('student_id', userId).maybeSingle();
  if (error) throw error;
  // Stored notes are cleaned again on the way out, so the page only ever draws known shapes.
  const notes = data ? sanitizeLessonNotes((data as { notes: unknown }).notes) : null;
  if (!data || !notes) throw new LessonNotesError('Notes not found', 404);
  return { ...toSummary(data as unknown as SummaryRow), notes };
}

export async function removeLessonNotes({ supabase, userId }: LessonNotesActor, id: string): Promise<void> {
  if (!isUuid(id)) throw new LessonNotesError('Notes not found', 404);
  const { data, error } = await supabase.from('lesson_notes').delete().eq('id', id).eq('student_id', userId).select('id');
  if (error) throw error;
  if (!data?.length) throw new LessonNotesError('Notes not found', 404);
}
