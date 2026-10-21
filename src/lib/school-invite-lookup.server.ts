import type { ServiceSupabase } from '@/lib/school-access.server'
import { inviteState, type InviteState } from '@/lib/school-invites'
import { hashInviteToken } from '@/lib/school-invites.server'

export type InviteLookup = {
  id: string
  email: string
  name: string | null
  role: string
  gradeLevel: string | null
  state: InviteState
  schoolId: string
  schoolName: string
}

/** Finds an invite by the token in its link. Null when no invite matches. */
export async function findInviteByToken(supabase: ServiceSupabase, token: string): Promise<InviteLookup | null> {
  if (!token || token.length > 200) return null
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('id, email, name, role, grade_level, expires_at, accepted_at, revoked_at, organizations!inner(id, name, type, is_active)')
    .eq('token', hashInviteToken(token))
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const school = (Array.isArray(data.organizations) ? data.organizations[0] : data.organizations) as
    | { id: string; name: string; type: string; is_active: boolean }
    | undefined
  if (!school || school.type !== 'school') return null
  const state = school.is_active ? inviteState(data) : 'revoked'
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,
    gradeLevel: data.grade_level,
    state,
    schoolId: school.id,
    schoolName: school.name,
  }
}
