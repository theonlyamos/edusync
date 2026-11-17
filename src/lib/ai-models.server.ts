import OpenAI from 'openai'
import { createAdminSupabase } from '@/lib/supabase-admin'
import {
  AI_MODEL_KEYS,
  CHAT_PROVIDERS,
  COLUMN,
  DEFAULTS,
  DEFAULT_VOICE,
  EMPTY_SETTINGS,
  PROVIDER_LABEL,
  type AiModelKey,
  type AiModelSettings,
  type ProviderStatus,
  type ResolvedSetting,
  type SettingSource,
} from '@/lib/ai-models'

/**
 * Server side of the AI model settings. Every feature asks here for its model
 * instead of reading env vars itself, so the admin panel can change them.
 */

type Env = Record<string, string | undefined>

type SavedRow = {
  settings: AiModelSettings
  updatedAt: string | null
  updatedById: string | null
}

const EMPTY_ROW: SavedRow = { settings: EMPTY_SETTINGS, updatedAt: null, updatedById: null }

/** How long each server instance reuses the saved settings before reading them again. */
export const SETTINGS_TTL_MS = 30_000

/** Longest the settings read may take before falling back to env vars. */
const READ_TIMEOUT_MS = 2_500

let cache: { at: number; row: SavedRow } | null = null
let inflight: Promise<SavedRow> | null = null
let warned = false

export function rowToSettings(row: Record<string, unknown> | null): AiModelSettings {
  const out = { ...EMPTY_SETTINGS }
  if (!row) return out
  for (const key of AI_MODEL_KEYS) {
    const value = row[COLUMN[key]]
    out[key] = typeof value === 'string' && value.trim() ? value.trim() : null
  }
  return out
}

async function readSaved(): Promise<SavedRow> {
  try {
    const { data, error } = await createAdminSupabase()
      .from('platform_ai_settings')
      .select('*')
      .eq('id', true)
      // A slow database must not hold up every AI request: give up and use env vars.
      .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
      .maybeSingle()
    if (error) throw error
    warned = false
    if (!data) return EMPTY_ROW
    return {
      settings: rowToSettings(data),
      updatedAt: (data.updated_at as string | null) ?? null,
      updatedById: (data.updated_by as string | null) ?? null,
    }
  } catch (error) {
    // Never block an AI feature on this read: fall back to env vars and defaults.
    if (!warned) console.warn('[ai-models] Could not read platform_ai_settings, using env vars:', (error as Error)?.message ?? error)
    warned = true
    return EMPTY_ROW
  }
}

/** The admin-saved settings, cached for SETTINGS_TTL_MS per server instance. */
export async function getSavedAiSettings(now: number = Date.now()): Promise<SavedRow> {
  if (cache && now - cache.at < SETTINGS_TTL_MS) return cache.row
  if (!inflight) {
    inflight = readSaved()
      .then((row) => {
        cache = { at: Date.now(), row }
        return row
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** Drop this instance's cached copy (after a save). Other instances refresh within SETTINGS_TTL_MS. */
export function clearAiSettingsCache() {
  cache = null
}

const envValue = (env: Env, name: string) => {
  const value = env[name]?.trim()
  return value ? value : null
}

type Pick = { value: string | null; source: SettingSource; envVar?: string }

const fromEnv = (env: Env, names: string[]): Pick | null => {
  for (const name of names) {
    const value = envValue(env, name)
    if (value) return { value, source: 'env', envVar: name }
  }
  return null
}

const builtIn = (value: string | null): Pick => (value ? { value, source: 'default' } : { value: null, source: 'missing' })

/** What a setting is when the admin panel leaves it blank. */
function fallbackFor(key: AiModelKey, settings: AiModelSettings, env: Env): Pick {
  switch (key) {
    case 'textProvider':
      return builtIn('GEMINI')
    case 'textModel': {
      const provider = resolveValue('textProvider', settings, env) ?? 'GEMINI'
      return fromEnv(env, [`${provider}_MODEL`]) ?? builtIn(provider === 'GEMINI' ? DEFAULTS.geminiTextModel : null)
    }
    case 'visualProvider':
      return fromEnv(env, ['AI_PROVIDER']) ?? builtIn('GEMINI')
    case 'visualModel': {
      const provider = resolveValue('visualProvider', settings, env) ?? 'GEMINI'
      return fromEnv(env, [`${provider}_MODEL`]) ?? builtIn(provider === 'GEMINI' ? DEFAULTS.geminiTextModel : null)
    }
    case 'imageModel':
      return fromEnv(env, ['GEMINI_IMAGE_MODEL']) ?? builtIn(DEFAULTS.imageModel)
    case 'extractionModel':
      return fromEnv(env, ['GEMINI_EXTRACTION_MODEL', 'GEMINI_MODEL']) ?? builtIn(DEFAULTS.extractionModel)
    case 'embeddingModel':
      return fromEnv(env, ['GEMINI_EMBEDDING_MODEL']) ?? builtIn(DEFAULTS.embeddingModel)
    case 'liveModel':
      return fromEnv(env, ['GEMINI_LIVE_MODEL', 'NEXT_PUBLIC_GEMINI_LIVE_MODEL']) ?? builtIn(null)
    case 'liveVoice':
      return builtIn(DEFAULT_VOICE)
    // The co-teacher runs on LiveKit Cloud with its own env; the app can't see it.
    case 'agentModel':
      return { value: null, source: 'agent' }
    case 'agentVoice':
      return { value: null, source: 'agent' }
  }
}

function resolveValue(key: AiModelKey, settings: AiModelSettings, env: Env): string | null {
  return settings[key] ?? fallbackFor(key, settings, env).value
}

/** Every setting with its value, where it came from, and what clearing it would give. */
export function resolveAiSettings(settings: AiModelSettings, env: Env = process.env): Record<AiModelKey, ResolvedSetting> {
  const out = {} as Record<AiModelKey, ResolvedSetting>
  for (const key of AI_MODEL_KEYS) {
    const fallback = fallbackFor(key, { ...settings, [key]: null }, env)
    const admin = settings[key]
    out[key] = admin
      ? { value: admin, source: 'admin', envVar: fallback.envVar, fallback: fallback.value, fallbackSource: fallback.source }
      : { value: fallback.value, source: fallback.source, envVar: fallback.envVar, fallback: fallback.value, fallbackSource: fallback.source }
  }
  return out
}

export type AiModels = {
  text: { provider: string; model: string | null }
  visual: { provider: string; model: string | null }
  imageModel: string
  extractionModel: string
  embeddingModel: string
  liveModel: string | null
  liveVoice: string
  /** Only what the admin panel set; the agent applies its own env fallbacks. */
  agentModel: string | null
  agentVoice: string | null
}

export function modelsFrom(settings: AiModelSettings, env: Env = process.env): AiModels {
  const r = resolveAiSettings(settings, env)
  return {
    text: { provider: r.textProvider.value ?? 'GEMINI', model: r.textModel.value },
    visual: { provider: r.visualProvider.value ?? 'GEMINI', model: r.visualModel.value },
    imageModel: r.imageModel.value ?? DEFAULTS.imageModel,
    extractionModel: r.extractionModel.value ?? DEFAULTS.extractionModel,
    embeddingModel: r.embeddingModel.value ?? DEFAULTS.embeddingModel,
    liveModel: r.liveModel.value,
    liveVoice: r.liveVoice.value ?? DEFAULT_VOICE,
    agentModel: settings.agentModel,
    agentVoice: settings.agentVoice,
  }
}

/** The models to use right now. */
export async function getAiModels(): Promise<AiModels> {
  return modelsFrom((await getSavedAiSettings()).settings)
}

/** Which chat providers have the credentials they need. */
export function providerStatuses(extra: (string | null)[] = [], env: Env = process.env): ProviderStatus[] {
  const ids = Array.from(new Set([...CHAT_PROVIDERS, ...extra.filter((p): p is string => !!p)]))
  return ids.map((id) => {
    const missing = [`${id}_API_KEY`, `${id}_BASE_URL`].filter((name) => !envValue(env, name))
    if (id !== 'GROQ' && !envValue(env, 'HELICONE_BASE_URL')) missing.push('HELICONE_BASE_URL')
    return { id, label: PROVIDER_LABEL[id] ?? id, ready: missing.length === 0, missing }
  })
}

/**
 * An OpenAI-SDK client for a chat provider. Gemini, Cerebras and OpenAI go
 * through Helicone (which logs and forwards to <NAME>_BASE_URL); Groq is called
 * directly. Built on first use and reused per provider.
 */
const clients = new Map<string, OpenAI>()
export function getChatClient(provider: string, env: Env = process.env): OpenAI {
  const existing = clients.get(provider)
  if (existing) return existing
  const baseUrl = envValue(env, `${provider}_BASE_URL`) ?? ''
  const apiKey = envValue(env, `${provider}_API_KEY`) ?? ''
  let client: OpenAI
  if (provider === 'GROQ') {
    client = new OpenAI({ baseURL: baseUrl, apiKey })
  } else {
    const helicone = (envValue(env, 'HELICONE_BASE_URL') ?? '') + (provider === 'GEMINI' ? 'beta' : '')
    client = new OpenAI({
      baseURL: helicone,
      apiKey,
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${envValue(env, 'HELICONE_API_KEY') ?? ''}`,
        'Helicone-Target-Url': baseUrl,
        'Helicone-Target-Provider': provider,
      },
    })
  }
  clients.set(provider, client)
  return client
}

/** Throws a clear error when a chat feature has no model to call. */
export function requireModel(feature: string, provider: string, model: string | null): string {
  if (!model) throw new Error(`No ${feature} model is set for ${provider}. Set one in the admin panel (AI models) or ${provider}_MODEL.`)
  return model
}
