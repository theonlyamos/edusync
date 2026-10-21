import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase.server'

export type PlatformAdminContext = {
  adminId: string
  supabase: ReturnType<typeof createServerSupabase>
}

/** Platform support staff only (users.role = 'admin'). */
export async function requirePlatformAdmin(): Promise<
  { ok: true; context: PlatformAdminContext } | { ok: false; response: NextResponse }
> {
  const session = await getServerSession()
  if (!session?.user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (session.user.role !== 'admin') return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true, context: { adminId: session.user.id, supabase: createServerSupabase() } }
}

/** Shown wherever the old screens let support create accounts with a typed password. */
export const ACCOUNTS_COME_FROM_SCHOOLS =
  'Support no longer creates accounts. Schools invite their teachers and students from the People tab, and anyone else can sign up.'

/**
 * Adds `schoolName` to each row, from the person's active school membership.
 * Support lists cover every school, so staff need to see which one a person is in.
 */
export async function withSchoolNames<T extends { id: string }>(
  supabase: PlatformAdminContext['supabase'],
  rows: T[],
): Promise<Array<T & { schoolName: string | null }>> {
  const ids = [...new Set(rows.map((row) => row.id).filter(Boolean))]
  const names = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id, organizations!inner(name, type)')
      .eq('is_active', true)
      .eq('organizations.type', 'school')
      .in('user_id', ids.slice(i, i + 200))
    if (error) {
      console.error('Could not load school names:', error)
      break
    }
    for (const row of (data ?? []) as Array<{ user_id: string; organizations: { name: string } | { name: string }[] | null }>) {
      const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations
      if (org?.name) names.set(row.user_id, org.name)
    }
  }
  return rows.map((row) => ({ ...row, schoolName: names.get(row.id) ?? null }))
}
