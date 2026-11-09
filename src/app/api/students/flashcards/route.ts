import { NextRequest, NextResponse } from 'next/server';
import { addFlashcards, flashcardFailure, listFlashcards, requireFlashcardStudent } from '@/lib/flashcards.server';

/** The student's revision cards and today's date at their school. */
export async function GET() {
  try {
    const actor = await requireFlashcardStudent();
    return NextResponse.json({ cards: await listFlashcards(actor), today: actor.today });
  } catch (error) {
    return flashcardFailure(error, 'Could not load your cards', 'GET /api/students/flashcards');
  }
}

/** Adds cards: { cards: [{ front, back, subject? }] }. */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireFlashcardStudent();
    return NextResponse.json(await addFlashcards(actor, await request.json().catch(() => null)), { status: 201 });
  } catch (error) {
    return flashcardFailure(error, 'Could not save the cards', 'POST /api/students/flashcards');
  }
}
