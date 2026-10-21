import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getCreditSummary } from '@/lib/school-billing.server'

/** What the dashboard credit widgets show: who pays, what's left, and this month's use. */
export async function GET(request: NextRequest) {
    const auth = getAuthContext(request)
    if (!auth?.userId || auth.authType !== 'session') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
        return NextResponse.json(await getCreditSummary(auth.userId))
    } catch (error) {
        console.error('Error in GET /api/credits/summary:', error)
        return NextResponse.json({ error: 'Failed to load credits' }, { status: 500 })
    }
}
