import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/platform-admin.server'
import { listProviderModels } from '@/lib/ai-models-admin.server'
import { providerStatuses } from '@/lib/ai-models.server'

export const dynamic = 'force-dynamic'

/** Model ids ?provider= offers, as suggestions. An empty list (with a note) when the provider can't be asked. */
export async function GET(request: NextRequest) {
  const access = await requirePlatformAdmin()
  if (!access.ok) return access.response
  const provider = (request.nextUrl.searchParams.get('provider') ?? '').toUpperCase()
  const status = providerStatuses([process.env.AI_PROVIDER?.trim().toUpperCase() ?? null]).find((p) => p.id === provider)
  if (!status) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
  if (status.missing.includes(`${provider}_API_KEY`)) return NextResponse.json({ models: [], note: `${status.label} has no API key on the server.` })
  try {
    return NextResponse.json({ models: await listProviderModels(provider) })
  } catch (error) {
    console.error('GET /api/admin/ai-models/available', provider, error)
    return NextResponse.json({ models: [], note: `Couldn't load ${status.label}'s model list. You can still type a model name.` })
  }
}
