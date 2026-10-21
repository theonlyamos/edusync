import type { ContentJobType } from './jobs';

export type OrganizationAiUsageCategory =
  | 'interactive_generation'
  | 'image_generation'
  | 'quiz_generation'
  | 'media_bytes'
  | 'student_fallback';

export function quotaCategoryForJob(jobType: ContentJobType): OrganizationAiUsageCategory {
  // Visual quizzes are built by the same visualization generator, so they
  // count as lesson visuals for the school's authoring allowance.
  if (jobType === 'generate_interactive' || jobType === 'generate_visual_quiz') return 'interactive_generation';
  if (jobType === 'generate_image') return 'image_generation';
  if (jobType === 'generate_structured_quiz') return 'quiz_generation';
  return 'media_bytes';
}
