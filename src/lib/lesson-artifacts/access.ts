export interface LessonOwnerRecord {
  teacher?: string | null;
  teacher_id?: string | null;
}

export function canManageLesson(input: {
  user: { id: string; role: string | null };
  lesson: LessonOwnerRecord;
  normalizedTeacherUserId?: string | null;
}): boolean {
  if (input.user.role === 'admin') return true;
  if (input.user.role !== 'teacher') return false;
  return input.lesson.teacher === input.user.id || input.normalizedTeacherUserId === input.user.id;
}
