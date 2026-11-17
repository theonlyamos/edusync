import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from './helpers/fake-supabase'
import { EMPTY_SETTINGS, cleanSetting, type AiModelSettings } from '@/lib/ai-models'
import { describeAction } from '@/lib/platform-admin'

const mocks = vi.hoisted(() => ({ session: vi.fn(), serverSupabase: vi.fn(), adminSupabase: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: mocks.serverSupabase, createSSRUserSupabase: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: mocks.adminSupabase }))

const models = await import('@/lib/ai-models.server')
const admin = await import('@/lib/ai-models-admin.server')
const { GET: agentConfig } = await import('@/app/api/live-classes/agent/config/route')
const { PUT: saveRoute } = await import('@/app/api/admin/ai-models/route')

const ADMIN = '00000000-0000-4000-8000-000000000001'
const settings = (over: Partial<AiModelSettings> = {}): AiModelSettings => ({ ...EMPTY_SETTINGS, ...over })
const READY = {
  GEMINI_API_KEY: 'g', GEMINI_BASE_URL: 'https://gemini.test', HELICONE_BASE_URL: 'https://helicone.test/v1',
  CEREBRAS_API_KEY: 'c', CEREBRAS_BASE_URL: 'https://cerebras.test/v1',
}

let fake: ReturnType<typeof fakeSupabase>
beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  fake = fakeSupabase({ platform_ai_settings: [], platform_admin_actions: [], users: [{ id: ADMIN, name: 'Support', email: 'support@test.com' }] })
  mocks.serverSupabase.mockReturnValue(fake.client)
  mocks.adminSupabase.mockReturnValue(fake.client)
  mocks.session.mockResolvedValue({ user: { id: ADMIN, role: 'admin' } })
  models.clearAiSettingsCache()
})

describe('resolving models', () => {
  it('keeps today’s env behaviour when nothing is set in the admin panel', () => {
    const env = { GEMINI_MODEL: 'gemini-env', AI_PROVIDER: 'CEREBRAS', CEREBRAS_MODEL: 'qwen-3.8-27b', GEMINI_IMAGE_MODEL: 'img-env', GEMINI_LIVE_MODEL: 'live-env' }
    const m = models.modelsFrom(settings(), env)
    expect(m.text).toEqual({ provider: 'GEMINI', model: 'gemini-env' })
    expect(m.visual).toEqual({ provider: 'CEREBRAS', model: 'qwen-3.8-27b' })
    expect(m.imageModel).toBe('img-env')
    expect(m.extractionModel).toBe('gemini-env')
    expect(m.embeddingModel).toBe('gemini-embedding-001')
    expect(m.liveModel).toBe('live-env')
    expect(m.liveVoice).toBe('Zephyr')
    expect(m.agentModel).toBeNull()
  })

  it('lets admin settings win, and follows the provider for the model fallback', () => {
    const env = { GEMINI_MODEL: 'gemini-env', CEREBRAS_MODEL: 'qwen', NEXT_PUBLIC_GEMINI_LIVE_MODEL: 'old-live' }
    const m = models.modelsFrom(settings({ textProvider: 'CEREBRAS', visualModel: 'gemini-pro-x', liveVoice: 'Kore', agentModel: 'agent-x' }), env)
    expect(m.text).toEqual({ provider: 'CEREBRAS', model: 'qwen' })
    expect(m.visual).toEqual({ provider: 'GEMINI', model: 'gemini-pro-x' })
    expect(m.liveModel).toBe('old-live')
    expect(m.liveVoice).toBe('Kore')
    expect(m.agentModel).toBe('agent-x')
  })

  it('says where each value comes from and what clearing it gives', () => {
    const r = models.resolveAiSettings(settings({ imageModel: 'img-admin' }), { GEMINI_IMAGE_MODEL: 'img-env' })
    expect(r.imageModel).toMatchObject({ value: 'img-admin', source: 'admin', fallback: 'img-env', fallbackSource: 'env', envVar: 'GEMINI_IMAGE_MODEL' })
    expect(r.liveModel).toMatchObject({ value: null, source: 'missing' })
    expect(r.textModel).toMatchObject({ value: 'gemini-2.5-flash', source: 'default' })
    expect(r.agentModel.source).toBe('agent')
  })

  it('has no model for a non-Gemini provider without one', () => {
    expect(models.modelsFrom(settings({ visualProvider: 'GROQ' }), {}).visual.model).toBeNull()
    expect(() => models.requireModel('visuals', 'GROQ', null)).toThrow(/GROQ_MODEL/)
  })

  it('reports which providers have credentials', () => {
    const status = models.providerStatuses([], READY)
    expect(status.find((p) => p.id === 'GEMINI')?.ready).toBe(true)
    expect(status.find((p) => p.id === 'CEREBRAS')?.ready).toBe(true)
    expect(status.find((p) => p.id === 'OPENAI')).toMatchObject({ ready: false, missing: ['OPENAI_API_KEY', 'OPENAI_BASE_URL'] })
    expect(models.providerStatuses([], { GROQ_API_KEY: 'k', GROQ_BASE_URL: 'https://groq.test' }).find((p) => p.id === 'GROQ')?.ready).toBe(true)
  })

  it('reads saved settings once per cache window and falls back when the table is missing', async () => {
    fake.tables.platform_ai_settings.push({ id: true, text_model: 'saved-text' })
    expect((await models.getAiModels()).text.model).toBe('saved-text')
    fake.tables.platform_ai_settings[0].text_model = 'newer'
    expect((await models.getAiModels()).text.model).toBe('saved-text')
    models.clearAiSettingsCache()
    expect((await models.getAiModels()).text.model).toBe('newer')

    models.clearAiSettingsCache()
    mocks.adminSupabase.mockImplementation(() => { throw new Error('relation does not exist') })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('GEMINI_MODEL', 'env-text')
    expect((await models.getAiModels()).text.model).toBe('env-text')
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('admin input', () => {
  it('cleans model, provider and voice values', () => {
    expect(cleanSetting('textModel', '  gemini-2.5-pro ')).toEqual({ ok: true, value: 'gemini-2.5-pro' })
    expect(cleanSetting('textModel', '')).toEqual({ ok: true, value: null })
    expect(cleanSetting('textModel', 'models/gemini-x')).toEqual({ ok: true, value: 'models/gemini-x' })
    expect(cleanSetting('textModel', 'bad model; drop').ok).toBe(false)
    expect(cleanSetting('textModel', 'x'.repeat(121)).ok).toBe(false)
    expect(cleanSetting('visualProvider', 'cerebras')).toEqual({ ok: true, value: 'CEREBRAS' })
    expect(cleanSetting('liveVoice', 'kore')).toEqual({ ok: true, value: 'Kore' })
    expect(cleanSetting('agentVoice', 'Robot').ok).toBe(false)
    expect(cleanSetting('textModel', 42).ok).toBe(false)
  })

  it('saves changes, logs them and refreshes the cache', async () => {
    await models.getAiModels() // warm the cache with nothing set
    const view = await admin.saveAiModelSettings({ adminId: ADMIN, supabase: fake.client }, { settings: { textModel: 'gemini-pro-x', liveVoice: 'Puck' } }, READY)
    expect(view.saved).toMatchObject({ textModel: 'gemini-pro-x', liveVoice: 'Puck', imageModel: null })
    expect(view.updatedBy?.email).toBe('support@test.com')
    expect(fake.tables.platform_ai_settings[0]).toMatchObject({ id: true, text_model: 'gemini-pro-x', live_voice: 'Puck', updated_by: ADMIN })
    expect(fake.tables.platform_admin_actions[0]).toMatchObject({ action: 'ai_models.update', target_type: 'platform', details: { changes: { textModel: { from: null, to: 'gemini-pro-x' }, liveVoice: { from: null, to: 'Puck' } } } })
    expect((await models.getAiModels()).text.model).toBe('gemini-pro-x')
    expect(describeAction({ action: 'ai_models.update', targetLabel: 'AI models', details: fake.tables.platform_admin_actions[0].details })).toBe('Changed the text model to gemini-pro-x, voice tutor voice to Puck')

    // Blank resets; keys left out keep their value; no-op saves log nothing.
    await admin.saveAiModelSettings({ adminId: ADMIN, supabase: fake.client }, { settings: { textModel: '' } }, READY)
    expect(fake.tables.platform_ai_settings[0]).toMatchObject({ text_model: null, live_voice: 'Puck' })
    await admin.saveAiModelSettings({ adminId: ADMIN, supabase: fake.client }, { settings: { liveVoice: 'Puck' } }, READY)
    expect(fake.tables.platform_admin_actions).toHaveLength(2)
  })

  it('refuses providers without credentials, unknown keys and bad values', async () => {
    const ctx = { adminId: ADMIN, supabase: fake.client }
    await expect(admin.saveAiModelSettings(ctx, { settings: { visualProvider: 'OPENAI' } }, READY)).rejects.toThrow(/OPENAI_API_KEY/)
    await expect(admin.saveAiModelSettings(ctx, { settings: { secret: 'x' } }, READY)).rejects.toThrow(/Unknown setting/)
    await expect(admin.saveAiModelSettings(ctx, { settings: { imageModel: '<script>' } }, READY)).rejects.toThrow()
    await expect(admin.saveAiModelSettings(ctx, {}, READY)).rejects.toThrow(/Send the settings/)
    expect(fake.tables.platform_ai_settings).toHaveLength(0)
    await admin.saveAiModelSettings(ctx, { settings: { visualProvider: 'cerebras' } }, READY)
    expect(fake.tables.platform_ai_settings[0].visual_provider).toBe('CEREBRAS')
  })

  it('only lets platform admins save', async () => {
    mocks.session.mockResolvedValue({ user: { id: ADMIN, role: 'teacher' } })
    const res = await saveRoute(new NextRequest('https://app.test/api/admin/ai-models', { method: 'PUT', body: JSON.stringify({ settings: { textModel: 'x' } }) }))
    expect(res.status).toBe(403)
    expect(fake.tables.platform_ai_settings).toHaveLength(0)
  })
})

describe('co-teacher config', () => {
  it('needs the agent secret and returns only what the admin set', async () => {
    vi.stubEnv('LIVE_CLASS_AGENT_SECRET', 'agent-secret')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.test')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    fake.tables.platform_ai_settings.push({ id: true, agent_model: 'gemini-live-x', live_voice: 'Kore' })
    const call = (secret: string) => agentConfig(new NextRequest('https://app.test/api/live-classes/agent/config', { headers: { 'x-live-class-agent-secret': secret } }))
    expect((await call('nope')).status).toBe(401)
    const ok = await call('agent-secret')
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ model: 'gemini-live-x', voice: null })
  })
})
