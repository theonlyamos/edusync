import { z } from 'zod';

import type { DBOrganizationMember } from '@/types/db';

export const updateLessonSchema = z.object({
  title: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(120),
  gradeLevel: z.string().trim().min(1).max(80),
  objectives: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  content: z.string().max(100_000).nullable().default(null),
  organizationId: z.string().uuid().optional(),
});

export type LessonUpdateInput = z.infer<typeof updateLessonSchema>;

export type OrganizationAdminMembership = Pick<
  DBOrganizationMember,
  'organization_id' | 'role' | 'is_active'
>;

export function mapLessonUpdate(input: LessonUpdateInput, updatedAt: string) {
  const row: {
    title: string;
    subject: string;
    gradelevel: string;
    objectives: string[];
    content: string | null;
    updated_at: string;
    organization_id?: string;
  } = {
    title: input.title,
    subject: input.subject,
    gradelevel: input.gradeLevel,
    objectives: input.objectives,
    content: input.content,
    updated_at: updatedAt,
  };

  if (Object.hasOwn(input, 'organizationId') && input.organizationId !== undefined) {
    row.organization_id = input.organizationId;
  }

  return row;
}

export function requiredOrganizationAdminIds(input: {
  actorRole: string | null;
  currentOrganizationId: string | null;
  update: Pick<LessonUpdateInput, 'organizationId'>;
}): string[] {
  if (!Object.hasOwn(input.update, 'organizationId')) return [];

  const target = input.update.organizationId;
  if (!target || target === input.currentOrganizationId || input.actorRole === 'admin') return [];

  return [...new Set([input.currentOrganizationId, target].filter((id): id is string => Boolean(id)))];
}

export function hasRequiredOrganizationAdminMemberships(
  requiredIds: string[],
  memberships: OrganizationAdminMembership[],
): boolean {
  return requiredIds.every((organizationId) => memberships.some((membership) => (
    membership.organization_id === organizationId
    && membership.is_active
    && (membership.role === 'owner' || membership.role === 'admin')
  )));
}

const LESSON_ORGANIZATION_GUARD_MESSAGES = new Set([
  'Not authorized to reassign lesson organization',
  'Lesson organization cannot be cleared',
  'Active owner or admin membership in current organization is required',
  'Active owner or admin membership in target organization is required',
]);

export function isLessonOrganizationGuardError(
  error: unknown,
  organizationChangeRequested: boolean,
): boolean {
  if (!organizationChangeRequested || typeof error !== 'object' || error === null) return false;

  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === '42501'
    && typeof candidate.message === 'string'
    && LESSON_ORGANIZATION_GUARD_MESSAGES.has(candidate.message);
}
