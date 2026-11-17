import { NextRequest, NextResponse } from 'next/server'
import { validateAgentSecret } from '@/lib/live-class-agent-auth'
import { getAiModels } from '@/lib/ai-models.server'

export const dynamic = 'force-dynamic'

/**
 * Called by the LiveKit co-teacher agent (shared secret) when a class starts.
 * Returns the model and voice set on the admin AI models page; null means
 * "not set there", and the agent falls back to its own env vars.
 */
export async function GET(request: NextRequest) {
  const authErr = validateAgentSecret(request)
  if (authErr) return authErr
  const { agentModel, agentVoice } = await getAiModels()
  return NextResponse.json({ model: agentModel, voice: agentVoice }, { headers: { 'Cache-Control': 'no-store' } })
}
