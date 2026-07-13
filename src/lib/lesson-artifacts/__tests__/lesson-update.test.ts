import { describe, expect, it } from 'vitest';

import {
  hasRequiredOrganizationAdminMemberships,
  isLessonOrganizationGuardError,
  mapLessonUpdate,
  requiredOrganizationAdminIds,
  updateLessonSchema,
  type OrganizationAdminMembership,
} from '@/lib/lesson-update';

const organizationId = '11111111-1111-4111-8111-111111111111';
const targetOrganizationId = '22222222-2222-4222-8222-222222222222';
const updatedAt = '2026-07-12T10:00:00.000Z';
const common = {
  title: 'Fractions',
  subject: 'Mathematics',
  gradeLevel: 'JHS 1',
  objectives: ['Compare fractions'],
  content: 'Lesson body',
};

describe('lesson update policy', () => {
  it('accepts omitted and UUID organization IDs but rejects null and malformed values', () => {
    expect(updateLessonSchema.parse(common)).not.toHaveProperty('organizationId');
    expect(updateLessonSchema.parse({ ...common, organizationId })).toMatchObject({ organizationId });
    expect(() => updateLessonSchema.parse({ ...common, organizationId: null })).toThrow();
    expect(() => updateLessonSchema.parse({ ...common, organizationId: 'not-a-uuid' })).toThrow();
  });

  it('maps only allowlisted fields and owns organization_id only for an explicit UUID', () => {
    const omitted = mapLessonUpdate(updateLessonSchema.parse(common), updatedAt);
    const explicit = mapLessonUpdate(updateLessonSchema.parse({ ...common, organizationId }), updatedAt);
    const typedUndefined = mapLessonUpdate({ ...common, organizationId: undefined }, updatedAt);

    expect(omitted).toEqual({
      title: 'Fractions',
      subject: 'Mathematics',
      gradelevel: 'JHS 1',
      objectives: ['Compare fractions'],
      content: 'Lesson body',
      updated_at: updatedAt,
    });
    expect(Object.hasOwn(omitted, 'organization_id')).toBe(false);
    expect(explicit.organization_id).toBe(organizationId);
    expect(Object.hasOwn(typedUndefined, 'organization_id')).toBe(false);
  });

  it('requires no membership lookup for omitted, same-organization, or global-admin updates', () => {
    expect(requiredOrganizationAdminIds({
      actorRole: 'teacher',
      currentOrganizationId: organizationId,
      update: updateLessonSchema.parse(common),
    })).toEqual([]);
    expect(requiredOrganizationAdminIds({
      actorRole: 'teacher',
      currentOrganizationId: organizationId,
      update: updateLessonSchema.parse({ ...common, organizationId }),
    })).toEqual([]);
    expect(requiredOrganizationAdminIds({
      actorRole: 'admin',
      currentOrganizationId: organizationId,
      update: updateLessonSchema.parse({ ...common, organizationId: targetOrganizationId }),
    })).toEqual([]);
  });

  it('requires target-only membership for an unowned lesson and source plus target for teacher reassignment', () => {
    expect(requiredOrganizationAdminIds({
      actorRole: 'teacher',
      currentOrganizationId: null,
      update: updateLessonSchema.parse({ ...common, organizationId: targetOrganizationId }),
    })).toEqual([targetOrganizationId]);
    expect(requiredOrganizationAdminIds({
      actorRole: 'teacher',
      currentOrganizationId: organizationId,
      update: updateLessonSchema.parse({ ...common, organizationId: targetOrganizationId }),
    })).toEqual([organizationId, targetOrganizationId]);
  });

  it('requires active owner or admin membership in every required organization', () => {
    const requiredIds = [organizationId, targetOrganizationId];
    const ownerAndAdmin: OrganizationAdminMembership[] = [
      { organization_id: organizationId, role: 'owner', is_active: true },
      { organization_id: targetOrganizationId, role: 'admin', is_active: true },
    ];

    expect(hasRequiredOrganizationAdminMemberships(requiredIds, ownerAndAdmin)).toBe(true);
    expect(hasRequiredOrganizationAdminMemberships(requiredIds, [ownerAndAdmin[1]])).toBe(false);
    expect(hasRequiredOrganizationAdminMemberships(requiredIds, [
      { organization_id: organizationId, role: 'owner', is_active: true },
      { organization_id: targetOrganizationId, role: 'member', is_active: true },
    ])).toBe(false);
    expect(hasRequiredOrganizationAdminMemberships(requiredIds, [
      { organization_id: organizationId, role: 'owner', is_active: false },
      { organization_id: targetOrganizationId, role: 'admin', is_active: true },
    ])).toBe(false);
  });

  it('classifies only known organization guard errors for real organization changes', () => {
    expect(isLessonOrganizationGuardError(
      { code: '42501', message: 'Active owner or admin membership in target organization is required' },
      true,
    )).toBe(true);
    expect(isLessonOrganizationGuardError(
      { code: '42501', message: 'Not authorized to reassign lesson organization' },
      true,
    )).toBe(true);
    expect(isLessonOrganizationGuardError(
      { code: '42501', message: 'Lesson organization cannot be cleared' },
      true,
    )).toBe(true);
    expect(isLessonOrganizationGuardError(
      { code: '42501', message: 'Active owner or admin membership in current organization is required' },
      true,
    )).toBe(true);
    expect(isLessonOrganizationGuardError(
      { code: '42501', message: 'permission denied for table lessons' },
      true,
    )).toBe(false);
    expect(isLessonOrganizationGuardError(
      { code: '42501', message: 'Active owner or admin membership in target organization is required' },
      false,
    )).toBe(false);
    expect(isLessonOrganizationGuardError({ code: '42501' }, true)).toBe(false);
  });
});
