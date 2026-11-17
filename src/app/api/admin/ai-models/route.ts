import { NextRequest, NextResponse } from 'next/server'
import { adminErrorResponse, requirePlatformAdmin } from '@/lib/platform-admin.server'
import { getAiModelsView, saveAiModelSettings } from '@/lib/ai-models-admin.server'

export const dynamic = 'force-dynamic'

/** The AI models every feature uses, where each comes from, and which providers are set up. */
export async function GET() {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    return NextResponse.json(await getAiModelsView(access.context.supabase))
  } catch (error) {
    return adminErrorResponse(error, 'Failed to load AI models', 'GET /api/admin/ai-models')
  }
}

/** Saves { settings: { textModel: 'x', liveVoice: '', ... } }. Blank resets a setting to its fallback. */
export async function PUT(request: NextRequest) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  try {
    const body = await request.json().catch(() => null)
    return NextResponse.json(await saveAiModelSettings(access.context, body))
  } catch (error) {
    return adminErrorResponse(error, 'Failed to save AI models', 'PUT /api/admin/ai-models')
  }
}
