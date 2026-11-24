import { NextRequest, NextResponse } from 'next/server';
import { LESSON_NOTES_MAX_BYTES, LessonNotesError, lessonNotesFailure, requireNotesStudent, saveLessonNotes } from '@/lib/lesson-notes.server';

/** Saves what the whiteboard tutor left behind in this session: { topic?, notes: { pages, cards } }. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireNotesStudent();
    const { id } = await params;
    const text = await request.text();
    if (text.length > LESSON_NOTES_MAX_BYTES) throw new LessonNotesError('These notes are too large to save.', 413);
    let body: unknown = null;
    try { body = JSON.parse(text); } catch { /* handled below as nothing to save */ }
    return NextResponse.json(await saveLessonNotes(actor, id, body));
  } catch (error) {
    return lessonNotesFailure(error, 'Could not save the notes', 'PUT /api/learning/sessions/[id]/notes');
  }
}
