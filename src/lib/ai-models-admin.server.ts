import { logAdminAction, AdminError, type PlatformAdminContext } from '@/lib/platform-admin.server'
import {
  AI_MODEL_KEYS,
  COLUMN,
  cleanSetting,
  isProviderKey,
  type AiModelKey,
  type AiModelSettings,
  type AiModelsView,
} from '@/lib/ai-models'
import { clearAiSettingsCache, providerStatuses, resolveAiSettings, rowToSettings } from '@/lib/ai-models.server'

type Env = Record<string, string | undefined>
type Supabase = PlatformAdminContext['supabase']

async function readRow(supabase: Supabase) {
  const { data, error } = await supabase.from('platform_ai_settings').select('*').eq('id', true).maybeSingle()
  if (error) throw error
  return {
    settings: rowToSettings(data),
    updatedAt: (data?.updated_at as string | null) ?? null,
    updatedById: (data?.updated_by as string | null) ?? null,
  }
}

/** What the admin AI models page shows: saved values, what each resolves to, and provider readiness. */
export async function getAiModelsView(supabase: Supabase, env: Env = process.env): Promise<AiModelsView> {
  const row = await readRow(supabase)
  let updatedBy: AiModelsView['updatedBy'] = null
  if (row.updatedById) {
    const { data } = await supabase.from('users').select('id, name, email').eq('id', row.updatedById).maybeSingle()
    if (data) updatedBy = { id: data.id as string, name: (data.name as string | null) ?? null, email: (data.email as string | null) ?? null }
  }
  const resolved = resolveAiSettings(row.settings, env)
  return {
    saved: row.settings,
    resolved,
    providers: providerStatuses([resolved.textProvider.value, resolved.visualProvider.value], env),
    updatedAt: row.updatedAt,
    updatedBy,
  }
}

/**
 * Saves the submitted settings (keys left out keep their saved value; blank
 * clears one back to its fallback) and records the change in the activity log.
 */
export async function saveAiModelSettings(context: PlatformAdminContext, input: unknown, env: Env = process.env): Promise<AiModelsView> {
  const body = (input && typeof input === 'object' ? input : {}) as { settings?: unknown }
  const submitted = (body.settings && typeof body.settings === 'object' ? body.settings : null) as Record<string, unknown> | null
  if (!submitted) throw new AdminError('Send the settings to save', 400)

  const current = (await readRow(context.supabase)).settings
  const next: AiModelSettings = { ...current }
  for (const key of Object.keys(submitted)) {
    if (!(AI_MODEL_KEYS as string[]).includes(key)) throw new AdminError(`Unknown setting: ${key}`, 400)
    const cleaned = cleanSetting(key as AiModelKey, submitted[key])
    if (!cleaned.ok) throw new AdminError(cleaned.error, 400)
    next[key as AiModelKey] = cleaned.value
  }

  // A provider can only be picked once its credentials are in the environment.
  const providers = providerStatuses([], env)
  for (const key of AI_MODEL_KEYS.filter(isProviderKey)) {
    const value = next[key]
    if (!value || value === current[key]) continue
    const status = providers.find((p) => p.id === value) ?? providerStatuses([value], env).find((p) => p.id === value)
    if (!status?.ready) throw new AdminError(`${status?.label ?? value} isn't set up on the server yet (missing ${status?.missing.join(', ')})`, 400)
  }

  const changes: Record<string, { from: string | null; to: string | null }> = {}
  for (const key of AI_MODEL_KEYS) {
    if (next[key] !== current[key]) changes[key] = { from: current[key], to: next[key] }
  }
  if (Object.keys(changes).length === 0) return getAiModelsView(context.supabase, env)

  const row: Record<string, unknown> = { id: true, updated_at: new Date().toISOString(), updated_by: context.adminId }
  for (const key of AI_MODEL_KEYS) row[COLUMN[key]] = next[key]
  const { error } = await context.supabase.from('platform_ai_settings').upsert(row, { onConflict: 'id' })
  if (error) throw error

  clearAiSettingsCache()
  await logAdminAction(context, { action: 'ai_models.update', targetType: 'platform', targetId: null, targetLabel: 'AI models', details: { changes } })
  return getAiModelsView(context.supabase, env)
}

/** Model ids a provider offers, for suggestions on the admin page. Cached for 10 minutes per instance. */
const listed = new Map<string, { at: number; ids: string[] }>()
export async function listProviderModels(provider: string, env: Env = process.env): Promise<string[]> {
  const hit = listed.get(provider)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.ids
  const apiKey = env[`${provider}_API_KEY`]?.trim()
  if (!apiKey) return []
  let ids: string[] = []
  if (provider === 'GEMINI') {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`Gemini answered ${res.status}`)
    const body = (await res.json()) as { models?: { name?: string }[] }
    ids = (body.models ?? []).map((m) => (m.name ?? '').replace(/^models\//, '')).filter(Boolean)
  } else {
    const baseUrl = env[`${provider}_BASE_URL`]?.trim()
    if (!baseUrl) return []
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`${provider} answered ${res.status}`)
    const body = (await res.json()) as { data?: { id?: string }[] }
    ids = (body.data ?? []).map((m) => m.id ?? '').filter(Boolean)
  }
  ids = Array.from(new Set(ids)).sort()
  listed.set(provider, { at: Date.now(), ids })
  return ids
}
