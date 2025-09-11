import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { deductCreditsForMinute } from '@/lib/credits'

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession()
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { sessionId } = await request.json()

        if (!sessionId) {
            return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
        }

        const result = await deductCreditsForMinute(session.user.id, sessionId)

        return NextResponse.json(result)
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            remainingCredits: 0,
            error: error.message
        }, { status: 500 })
    }
}
