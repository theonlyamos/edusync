export interface ObjectiveQuizAttempt {
  source: 'teacher_approved' | 'session_generated';
  artifactKind: 'structured_quiz' | 'visual_quiz';
  objectiveRevision: number;
  percentage: number;
}

export function hasObjectiveMastery(input: {
  objectiveRevision: number;
  attempts: ObjectiveQuizAttempt[];
}): boolean {
  return input.attempts.some(
    (attempt) =>
      attempt.source === 'teacher_approved' &&
      attempt.artifactKind === 'structured_quiz' &&
      attempt.objectiveRevision === input.objectiveRevision &&
      attempt.percentage >= 80,
  );
}
