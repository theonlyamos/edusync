import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { getUserCredits, getCreditHistory, getCreditUsageByTopic } from '@/lib/credits'

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession()
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const credits = await getUserCredits(session.user.id)
        const { data: history } = await getCreditHistory(session.user.id, 10)
        const { data: usageByTopic } = await getCreditUsageByTopic(session.user.id)

        return NextResponse.json({
            credits,
            recentTransactions: history,
            usageByTopic
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
