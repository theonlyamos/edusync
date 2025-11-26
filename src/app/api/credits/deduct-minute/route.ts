import { NextRequest, NextResponse } from 'next/server'
import { deductCreditsForMinute } from '@/lib/credits'
import { getAuthContext } from '@/lib/get-auth-context'

export async function POST(request: NextRequest) {
    try {
        const authContext = getAuthContext(request)
        const userId = authContext?.userId
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { sessionId } = await request.json()

        if (!sessionId) {
            return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
        }

        const result = await deductCreditsForMinute(userId, sessionId)

        return NextResponse.json(result)
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            remainingCredits: 0,
            error: error.message
        }, { status: 500 })
    }
}
