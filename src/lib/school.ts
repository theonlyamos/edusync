import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Two rows belong to the same school. Rows with no school (only possible on a
 * database that has no school yet) match each other, like SQL's
 * IS NOT DISTINCT FROM in the school-scoping migration.
 */
export function inSameSchool(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null)
}

/**
 * A row is visible to someone through their school only while they hold an
 * active membership in that same school. Use the id from getUserSchoolId, not
 * the students/teachers organization_id column, which stays set after a
 * membership is deactivated.
 */
export function inActiveSchool(activeSchoolId: string | null | undefined, rowSchoolId: string | null | undefined): boolean {
  return Boolean(activeSchoolId) && activeSchoolId === rowSchoolId
}

/** The one school a user belongs to, or null (platform admins, individual learners). */
export async function getUserSchoolId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('user_school_id', { p_user_id: userId })
  if (error) throw error
  return typeof data === 'string' && data.length > 0 ? data : null
}

export type MemberFormRole = 'owner' | 'admin' | 'teacher' | 'student' | 'learner'
export type OrganizationMemberRole = 'owner' | 'admin' | 'member' | 'teacher' | 'student'

/**
 * Role stored in organization_members for a role picked in the admin member form.
 * Schools keep teacher and student; other organizations only know owner/admin/member.
 */
export function organizationMemberRole(role: MemberFormRole, orgType: string | null | undefined): OrganizationMemberRole {
  if (role === 'owner' || role === 'admin') return role
  if (orgType !== 'school') return 'member'
  return role === 'teacher' ? 'teacher' : 'student'
}

/**
 * App-wide users.role for a brand-new account added through an organization.
 * Organization owners and admins are never made platform admins.
 */
export function newAccountUserRole(role: MemberFormRole): 'teacher' | 'student' | 'learner' {
  if (role === 'teacher') return 'teacher'
  if (role === 'student') return 'student'
  return 'learner'
}

/** Shown when someone tries to add or edit school members from the organization screens. */
export const SCHOOL_MEMBERS_BY_INVITE_ONLY = 'People join a school by invite. Use the People tab on your school page to invite them.'

export async function isSchoolOrganization(supabase: SupabaseClient, organizationId: string): Promise<boolean> {
  const { data, error } = await supabase.from('organizations').select('type').eq('id', organizationId).maybeSingle()
  if (error) throw error
  return data?.type === 'school'
}

/**
 * School membership role changes that need no account or profile changes:
 * between owner and admin only. Teacher and student memberships are tied to
 * users.role and a teachers/students row, so they cannot be switched in place.
 */
export function canChangeSchoolMemberRole(from: string, to: string): boolean {
  const managers = ['owner', 'admin']
  return managers.includes(from) && managers.includes(to)
}
