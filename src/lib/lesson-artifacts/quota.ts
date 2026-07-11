import type { ContentJobType } from './jobs';

export type OrganizationAiUsageCategory =
  | 'interactive_generation'
  | 'image_generation'
  | 'quiz_generation'
  | 'media_bytes'
  | 'student_fallback';

export function quotaCategoryForJob(jobType: ContentJobType): OrganizationAiUsageCategory {
  if (jobType === 'generate_interactive') return 'interactive_generation';
  if (jobType === 'generate_image') return 'image_generation';
  if (jobType === 'generate_structured_quiz' || jobType === 'generate_visual_quiz') return 'quiz_generation';
  return 'media_bytes';
}
