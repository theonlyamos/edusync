import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { rateLimit } from '@/lib/rate-limiter'
import { runVisualizeGeneration } from '@/lib/visualize-ai-task'

export async function POST(request: NextRequest) {
  try {
    const authContext = getAuthContext(request)
    if (!authContext) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResponse = await rateLimit(request, 'api')
    if (rateLimitResponse) return rateLimitResponse

    const body = await request.json()
    const { task_description, panel_dimensions, theme, theme_colors } = body

    if (!task_description) {
      return NextResponse.json({ error: 'task_description is required' }, { status: 400 })
    }

    const result = await runVisualizeGeneration({
      task_description,
      panel_dimensions,
      theme,
      theme_colors,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Failed to generate visualization:', error)
    return NextResponse.json(
      { error: 'Failed to generate visualization', details: error.message },
      { status: 500 }
    )
  }
}
