import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { getUserCredits, getCreditHistory } from '@/lib/credits'

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession()
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const credits = await getUserCredits(session.user.id)
        const { data: history } = await getCreditHistory(session.user.id, 10)

        return NextResponse.json({
            credits,
            recentTransactions: history
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
