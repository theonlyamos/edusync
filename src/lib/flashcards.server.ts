import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { dayKey } from '@/lib/school-reports';
import { getActiveSchoolMembership, type ServiceSupabase } from '@/lib/school-access.server';
import { createServerSupabase } from '@/lib/supabase.server';
import { FLASHCARD_LIMIT, afterReview, parseFlashcard, parseFlashcards, type Flashcard } from '@/lib/flashcards';

export class FlashcardError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function flashcardFailure(error: unknown, fallback: string, where: string) {
  if (error instanceof FlashcardError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`[${where}]`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export type FlashcardActor = { supabase: ServiceSupabase; userId: string; today: string };

/** The signed-in student, with today's date where their school is. */
export async function requireFlashcardStudent(): Promise<FlashcardActor> {
  const session = await getServerSession();
  if (!session?.user) throw new FlashcardError('Unauthorized', 401);
  if (session.user.role !== 'student') throw new FlashcardError('Flashcards are for students', 403);
  const supabase = createServerSupabase();
  const membership = await getActiveSchoolMembership(supabase, session.user.id);
  return { supabase, userId: session.user.id, today: dayKey(new Date(), membership?.school.timezone || 'UTC') };
}

const FIELDS = 'id, subject, front, back, box, due_on, reviews';
type Row = { id: string; subject: string; front: string; back: string; box: number; due_on: string; reviews: number };
const toCard = (row: Row): Flashcard => ({ id: row.id, subject: row.subject, front: row.front, back: row.back, box: row.box, dueOn: row.due_on, reviews: row.reviews });

const requireId = (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new FlashcardError('Card not found', 404);
};

export async function listFlashcards({ supabase, userId }: FlashcardActor): Promise<Flashcard[]> {
  const { data, error } = await supabase.from('flashcards').select(FIELDS).eq('student_id', userId).order('due_on').order('created_at').limit(FLASHCARD_LIMIT);
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toCard);
}

/** Adds cards the student doesn't already have. Returns how many were new. */
export async function addFlashcards(actor: FlashcardActor, body: unknown): Promise<{ added: number; skipped: number }> {
  const cards = parseFlashcards((body as { cards?: unknown } | null)?.cards);
  if (typeof cards === 'string') throw new FlashcardError(cards);
  const { supabase, userId, today } = actor;
  const { count, error: countError } = await supabase.from('flashcards').select('id', { count: 'exact', head: true }).eq('student_id', userId);
  if (countError) throw countError;
  if ((count ?? 0) + cards.length > FLASHCARD_LIMIT) throw new FlashcardError(`You can keep up to ${FLASHCARD_LIMIT} cards. Remove some you know well first.`, 409);
  let added = 0;
  // One at a time, so a card the student already has is skipped without losing the rest.
  for (const card of cards) {
    const { error } = await supabase.from('flashcards').insert({ student_id: userId, subject: card.subject, front: card.front, back: card.back, due_on: today });
    if (!error) added += 1;
    else if (error.code !== '23505') throw error;
  }
  return { added, skipped: cards.length - added };
}

async function ownCard({ supabase, userId }: FlashcardActor, id: string): Promise<Row> {
  requireId(id);
  const { data, error } = await supabase.from('flashcards').select(FIELDS).eq('id', id).eq('student_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new FlashcardError('Card not found', 404);
  return data as Row;
}

/** Records a review ({ remembered }) or rewrites the card ({ front, back, subject }). */
export async function updateFlashcard(actor: FlashcardActor, id: string, body: unknown): Promise<Flashcard> {
  const card = await ownCard(actor, id);
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  let change: Record<string, unknown>;
  if (typeof input.remembered === 'boolean') {
    // A card reviewed early stays where it is, so tapping through a session twice can't skip the wait.
    if (card.due_on > actor.today) return toCard(card);
    const next = afterReview(card.box, input.remembered, actor.today);
    change = { box: next.box, due_on: next.dueOn, reviews: card.reviews + 1, last_reviewed_at: new Date().toISOString() };
  } else {
    const edited = parseFlashcard({ subject: input.subject ?? card.subject, front: input.front ?? card.front, back: input.back ?? card.back });
    if (typeof edited === 'string') throw new FlashcardError(edited);
    change = edited;
  }
  const { data, error } = await actor.supabase.from('flashcards').update(change).eq('id', id).eq('student_id', actor.userId).select(FIELDS).maybeSingle();
  if (error?.code === '23505') throw new FlashcardError('You already have a card with this question.', 409);
  if (error) throw error;
  if (!data) throw new FlashcardError('Card not found', 404);
  return toCard(data as Row);
}

export async function removeFlashcard({ supabase, userId }: FlashcardActor, id: string): Promise<void> {
  requireId(id);
  const { data, error } = await supabase.from('flashcards').delete().eq('id', id).eq('student_id', userId).select('id');
  if (error) throw error;
  if (!data?.length) throw new FlashcardError('Card not found', 404);
}
