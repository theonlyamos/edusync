import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase.server'

export type ServiceSupabase = ReturnType<typeof createServerSupabase>

const SCHOOL_FIELDS = 'id, name, description, owner_id, country, timezone, grade_levels, setup_dismissed_at, total_credits_purchased, created_at'

export type SchoolRecord = {
  id: string
  name: string
  description: string | null
  owner_id: string
  country: string | null
  timezone: string | null
  grade_levels: string[] | null
  setup_dismissed_at: string | null
  total_credits_purchased: number | null
  created_at: string
}

export type SchoolMembership = { role: string; school: SchoolRecord }

/** The caller's school and their role in it, or null when they have none. */
export async function getActiveSchoolMembership(supabase: ServiceSupabase, userId: string): Promise<SchoolMembership | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select(`role, organizations!inner(${SCHOOL_FIELDS}, type)`)
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('organizations.type', 'school')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const school = (Array.isArray(data.organizations) ? data.organizations[0] : data.organizations) as SchoolRecord | undefined
  return school ? { role: data.role as string, school } : null
}

export function isSchoolManager(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/** Whether the school (or, before school checkout exists, its owner) has bought credits. */
export async function schoolHasPurchasedCredits(supabase: ServiceSupabase, school: Pick<SchoolRecord, 'owner_id' | 'total_credits_purchased'>) {
  if ((school.total_credits_purchased ?? 0) > 0) return true
  const { count, error } = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', school.owner_id)
    .eq('transaction_type', 'purchase')
  if (error) throw error
  return (count ?? 0) > 0
}

export type SchoolRouteContext = {
  userId: string
  userName: string | null
  supabase: ServiceSupabase
  membership: SchoolMembership
}

/**
 * For school API routes: the signed-in caller, a service client and their
 * school membership, or the error response to return. `roles` limits which
 * school roles may continue.
 */
export async function requireSchoolRole(
  roles: readonly string[],
): Promise<{ ok: true; context: SchoolRouteContext } | { ok: false; response: NextResponse }> {
  const session = await getServerSession()
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const supabase = createServerSupabase()
  const membership = await getActiveSchoolMembership(supabase, session.user.id)
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: 'You are not in a school' }, { status: 403 }) }
  }
  if (!roles.includes(membership.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Your school role cannot do this' }, { status: 403 }) }
  }
  return { ok: true, context: { userId: session.user.id, userName: session.user.name, supabase, membership } }
}

export const SCHOOL_MANAGER_ROLES = ['owner', 'admin'] as const
