import { NextRequest, NextResponse } from 'next/server';
import { flashcardFailure, removeFlashcard, requireFlashcardStudent, updateFlashcard } from '@/lib/flashcards.server';

type Params = { params: Promise<{ id: string }> };

/** Records a review ({ remembered }) or rewrites the card. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireFlashcardStudent();
    return NextResponse.json({ card: await updateFlashcard(actor, (await params).id, await request.json().catch(() => null)) });
  } catch (error) {
    return flashcardFailure(error, 'Could not save the card', 'PATCH /api/students/flashcards/[id]');
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requireFlashcardStudent();
    await removeFlashcard(actor, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return flashcardFailure(error, 'Could not remove the card', 'DELETE /api/students/flashcards/[id]');
  }
}
