import { shiftDay } from '@/lib/school-records';

export const FLASHCARD_FRONT_MAX = 500;
export const FLASHCARD_BACK_MAX = 1000;
export const FLASHCARD_SUBJECT_MAX = 80;
/** Cards one student can keep. */
export const FLASHCARD_LIMIT = 500;
/** Cards one request can add. */
export const FLASHCARD_BATCH = 20;
export const FLASHCARD_BOXES = 5;

/** Days until a card comes back, by box. A remembered card moves up a box; a missed one starts again. */
const WAIT_DAYS = [1, 2, 4, 8, 16];

export type Flashcard = {
  id: string;
  subject: string;
  front: string;
  back: string;
  box: number;
  dueOn: string;
  reviews: number;
};

export type FlashcardInput = { subject: string; front: string; back: string };

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Cleans one card, or says what is wrong with it. */
export function parseFlashcard(value: unknown): FlashcardInput | string {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const front = text(raw.front, FLASHCARD_FRONT_MAX);
  const back = text(raw.back, FLASHCARD_BACK_MAX);
  if (!front) return 'Write the question for the front of the card.';
  if (!back) return 'Write the answer for the back of the card.';
  return { subject: text(raw.subject, FLASHCARD_SUBJECT_MAX), front, back };
}

/** Cleans a batch: drops repeats of the same question, keeps the first. */
export function parseFlashcards(value: unknown): FlashcardInput[] | string {
  if (!Array.isArray(value) || value.length === 0) return 'Add at least one card.';
  if (value.length > FLASHCARD_BATCH) return `Add up to ${FLASHCARD_BATCH} cards at a time.`;
  const seen = new Set<string>();
  const cards: FlashcardInput[] = [];
  for (const item of value) {
    const card = parseFlashcard(item);
    if (typeof card === 'string') return card;
    const key = card.front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(card);
  }
  return cards;
}

/** Where a card goes after a review, and the day it is next due. */
export function afterReview(box: number, remembered: boolean, today: string): { box: number; dueOn: string } {
  const current = Math.min(FLASHCARD_BOXES, Math.max(1, Math.floor(box) || 1));
  const next = remembered ? Math.min(FLASHCARD_BOXES, current + 1) : 1;
  // A missed card comes back tomorrow; a remembered one waits for its new box.
  return { box: next, dueOn: shiftDay(today, remembered ? WAIT_DAYS[next - 1] : 1) };
}

export const isDue = (card: Pick<Flashcard, 'dueOn'>, today: string) => card.dueOn <= today;

/** Cards to review today, the least known first. */
export function dueCards(cards: Flashcard[], today: string): Flashcard[] {
  return cards.filter((card) => isDue(card, today)).sort((a, b) => a.box - b.box || a.dueOn.localeCompare(b.dueOn));
}

/** "Tomorrow", "In 4 days", for a card that isn't due yet. */
export function dueLabel(dueOn: string, today: string): string {
  if (dueOn <= today) return 'Due now';
  const days = Math.round((Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
}

/** The card a missed practice question becomes. */
export function cardFromQuestion(question: { question: string; correctAnswer: string | string[]; explanation?: string }, subject: string): FlashcardInput | null {
  const answer = Array.isArray(question.correctAnswer) ? question.correctAnswer.join(', ') : String(question.correctAnswer ?? '');
  const card = parseFlashcard({ subject, front: question.question, back: [answer, question.explanation].filter((part) => part && String(part).trim()).join(' · ') });
  return typeof card === 'string' ? null : card;
}
