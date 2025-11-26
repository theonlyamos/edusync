import { NextRequest, NextResponse } from 'next/server'
import { getUserCredits, getCreditHistory, getCreditUsageByTopic } from '@/lib/credits'
import { getAuthContext } from '@/lib/get-auth-context'

export async function GET(request: NextRequest) {
    try {
        const authContext = getAuthContext(request)
        const userId = authContext?.userId
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const credits = await getUserCredits(userId)
        const { data: history } = await getCreditHistory(userId, 10)
        const { data: usageByTopic } = await getCreditUsageByTopic(userId)

        return NextResponse.json({
            credits,
            recentTransactions: history,
            usageByTopic
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
