import { NextRequest, NextResponse } from 'next/server';
import { getLessonNotes, lessonNotesFailure, removeLessonNotes, requireNotesStudent } from '@/lib/lesson-notes.server';

type Context = { params: Promise<{ id: string }> };

/** One saved lesson with its boards and review cards. */
export async function GET(_request: NextRequest, { params }: Context) {
  try {
    return NextResponse.json(await getLessonNotes(await requireNotesStudent(), (await params).id));
  } catch (error) {
    return lessonNotesFailure(error, 'Could not load these notes', 'GET /api/students/lesson-notes/[id]');
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    await removeLessonNotes(await requireNotesStudent(), (await params).id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return lessonNotesFailure(error, 'Could not remove these notes', 'DELETE /api/students/lesson-notes/[id]');
  }
}
