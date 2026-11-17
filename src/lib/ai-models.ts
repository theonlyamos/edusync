/**
 * The AI models the app uses, and the platform admin settings that pick them.
 *
 * Client-safe: types, labels and validation only. The server side (reading
 * the saved settings, env fallbacks, provider clients) is ai-models.server.ts.
 *
 * Each setting resolves in this order: the admin panel (/admin/ai-models),
 * then the environment variable it replaced, then a built-in default.
 */

/** Chat providers reached through Helicone with the OpenAI SDK. Each needs <NAME>_API_KEY and <NAME>_BASE_URL. */
export const CHAT_PROVIDERS = ['GEMINI', 'CEREBRAS', 'GROQ', 'OPENAI'] as const
export type ChatProvider = string

export const PROVIDER_LABEL: Record<string, string> = {
  GEMINI: 'Google Gemini',
  CEREBRAS: 'Cerebras',
  GROQ: 'Groq',
  OPENAI: 'OpenAI',
}

/** Gemini Live prebuilt voices. */
export const LIVE_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
] as const
export const DEFAULT_VOICE = 'Zephyr'

export const DEFAULTS = {
  geminiTextModel: 'gemini-2.5-flash',
  imageModel: 'gemini-3.1-flash-image',
  extractionModel: 'gemini-2.5-flash',
  embeddingModel: 'gemini-embedding-001',
  agentModel: 'gemini-3.8-live',
} as const

/** The saved admin settings. null means "not set here, use the fallback". */
export type AiModelSettings = {
  textProvider: string | null
  textModel: string | null
  visualProvider: string | null
  visualModel: string | null
  imageModel: string | null
  extractionModel: string | null
  embeddingModel: string | null
  liveModel: string | null
  liveVoice: string | null
  agentModel: string | null
  agentVoice: string | null
}
export type AiModelKey = keyof AiModelSettings

export const AI_MODEL_KEYS: AiModelKey[] = [
  'textProvider', 'textModel', 'visualProvider', 'visualModel', 'imageModel',
  'extractionModel', 'embeddingModel', 'liveModel', 'liveVoice', 'agentModel', 'agentVoice',
]

export const EMPTY_SETTINGS: AiModelSettings = Object.fromEntries(AI_MODEL_KEYS.map((k) => [k, null])) as AiModelSettings

/** Database column for each setting. */
export const COLUMN: Record<AiModelKey, string> = {
  textProvider: 'text_provider',
  textModel: 'text_model',
  visualProvider: 'visual_provider',
  visualModel: 'visual_model',
  imageModel: 'image_model',
  extractionModel: 'extraction_model',
  embeddingModel: 'embedding_model',
  liveModel: 'live_model',
  liveVoice: 'live_voice',
  agentModel: 'agent_model',
  agentVoice: 'agent_voice',
}

export const SETTING_LABEL: Record<AiModelKey, string> = {
  textProvider: 'Text provider',
  textModel: 'Text model',
  visualProvider: 'Visuals provider',
  visualModel: 'Visuals model',
  imageModel: 'Image model',
  extractionModel: 'Upload reading model',
  embeddingModel: 'Search index model',
  liveModel: 'Voice tutor model',
  liveVoice: 'Voice tutor voice',
  agentModel: 'Co-teacher model',
  agentVoice: 'Co-teacher voice',
}

/** Where a resolved value came from, for the admin page. */
export type SettingSource = 'admin' | 'env' | 'default' | 'agent' | 'missing'

export type ResolvedSetting = {
  value: string | null
  source: SettingSource
  /** The env var that supplied it, or that the admin value overrides. */
  envVar?: string
  /** What it falls back to if the admin value is cleared. */
  fallback: string | null
  fallbackSource: SettingSource
}

export type ProviderStatus = { id: string; label: string; ready: boolean; missing: string[] }

export type AiModelsView = {
  saved: AiModelSettings
  resolved: Record<AiModelKey, ResolvedSetting>
  providers: ProviderStatus[]
  updatedAt: string | null
  updatedBy: { id: string; name: string | null; email: string | null } | null
}

const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,119}$/
const PROVIDER_NAME = /^[A-Z][A-Z0-9_]{1,30}$/

export const isProviderKey = (key: AiModelKey) => key === 'textProvider' || key === 'visualProvider'
export const isVoiceKey = (key: AiModelKey) => key === 'liveVoice' || key === 'agentVoice'

/**
 * Checks one submitted value. Blank clears the setting. Returns the cleaned
 * value or an error to show next to the field.
 */
export function cleanSetting(key: AiModelKey, raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: `${SETTING_LABEL[key]} must be text` }
  const value = raw.trim()
  if (!value) return { ok: true, value: null }
  if (isProviderKey(key)) {
    const upper = value.toUpperCase()
    return PROVIDER_NAME.test(upper) ? { ok: true, value: upper } : { ok: false, error: `${SETTING_LABEL[key]} isn't a provider name` }
  }
  if (isVoiceKey(key)) {
    const voice = LIVE_VOICES.find((v) => v.toLowerCase() === value.toLowerCase())
    return voice ? { ok: true, value: voice } : { ok: false, error: `${value} isn't a Gemini Live voice` }
  }
  return MODEL_NAME.test(value)
    ? { ok: true, value }
    : { ok: false, error: `${SETTING_LABEL[key]} can only use letters, numbers and . _ - : / @ +` }
}
