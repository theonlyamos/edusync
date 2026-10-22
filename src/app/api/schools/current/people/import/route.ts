import { NextRequest, NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-origin'
import { requireSchoolRole, schoolHasPurchasedCredits, SCHOOL_MANAGER_ROLES } from '@/lib/school-access.server'
import { IMPORT_BATCH_SIZE, PEOPLE_BEFORE_FIRST_PURCHASE, parsePersonRole, validateNewPerson } from '@/lib/school-people'
import { createSchoolPerson, peopleErrorResponse, PeopleError } from '@/lib/school-people.server'

export const maxDuration = 60

type Outcome = { email: string; outcome: 'added' | 'failed'; message?: string; emailed?: boolean; url?: string }

/**
 * Adds part of a CSV file: { role, people: [...] }, up to IMPORT_BATCH_SIZE
 * at a time. Each row succeeds or fails on its own.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(SCHOOL_MANAGER_ROLES)
    if (!guard.ok) return guard.response
    const { supabase, membership, userId, userName } = guard.context
    const body = await request.json().catch(() => null)
    const role = parsePersonRole(body?.role)
    if (!role) return NextResponse.json({ error: 'Role must be student, teacher or admin' }, { status: 400 })
    if (role === 'admin' && membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the school owner can add administrators' }, { status: 403 })
    }
    const people: unknown[] = Array.isArray(body?.people) ? body.people : []
    if (people.length === 0) return NextResponse.json({ error: 'No people to add' }, { status: 400 })
    if (people.length > IMPORT_BATCH_SIZE) {
      return NextResponse.json({ error: `Send at most ${IMPORT_BATCH_SIZE} people per request` }, { status: 400 })
    }

    const school = membership.school
    const context = { supabase, school, actor: { id: userId, name: userName }, origin: appOrigin(request) }

    // Check the limit once for the whole part, not per row.
    if (!(await schoolHasPurchasedCredits(supabase, school))) {
      const { count, error } = await supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', school.id)
        .neq('role', 'owner')
      if (error) throw error
      const left = Math.max(0, PEOPLE_BEFORE_FIRST_PURCHASE - (count ?? 0))
      if (people.length > left) {
        throw new PeopleError(
          `Schools can add ${PEOPLE_BEFORE_FIRST_PURCHASE} people before buying credits. You can add ${left} more. Buy credits to add more people.`,
          409,
        )
      }
    }

    const results: Outcome[] = []
    for (const input of people) {
      const checked = validateNewPerson(role, (input ?? {}) as Record<string, unknown>, school.grade_levels ?? [])
      const email = typeof (input as any)?.email === 'string' ? (input as any).email.trim().toLowerCase() : ''
      if (!checked.ok) {
        results.push({ email, outcome: 'failed', message: checked.error })
        continue
      }
      try {
        const created = await createSchoolPerson(context, checked.value, { skipLimit: true })
        results.push({ email: created.email, outcome: 'added', emailed: created.emailed, url: created.url })
      } catch (error) {
        const message = error instanceof PeopleError ? error.message : 'Could not create this account'
        if (!(error instanceof PeopleError)) console.error('CSV import row failed:', error)
        results.push({ email: checked.value.email, outcome: 'failed', message })
      }
    }
    return NextResponse.json({ results })
  } catch (error) {
    const { body, status } = peopleErrorResponse(error, 'Failed to add people', 'POST /api/schools/current/people/import')
    return NextResponse.json(body, { status })
  }
}
