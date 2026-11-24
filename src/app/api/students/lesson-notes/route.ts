import { NextResponse } from 'next/server';
import { lessonNotesFailure, listLessonNotes, requireNotesStudent } from '@/lib/lesson-notes.server';

/** The student's saved whiteboard lessons, newest first. */
export async function GET() {
  try {
    return NextResponse.json({ notes: await listLessonNotes(await requireNotesStudent()) });
  } catch (error) {
    return lessonNotesFailure(error, 'Could not load your notes', 'GET /api/students/lesson-notes');
  }
}
