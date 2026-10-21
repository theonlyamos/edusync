import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Two rows belong to the same school. Rows with no school (only possible on a
 * database that has no school yet) match each other, like SQL's
 * IS NOT DISTINCT FROM in the school-scoping migration.
 */
export function inSameSchool(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null)
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
