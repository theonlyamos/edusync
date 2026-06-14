import { describe, it, expect, beforeEach, vi } from 'vitest'

// env() reads process.env on first call and memoizes in a module-level cache.
// vi.resetModules() lets each test re-import a fresh module with fresh env.
const BASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
}

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...overrides })) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
    else process.env[k] = v
  }
  const mod = await import('@/lib/env')
  return mod.env()
}

describe('env() AI_PROVIDER', () => {
  beforeEach(() => {
    for (const k of [...Object.keys(BASE_ENV), 'AI_PROVIDER']) {
      delete (process.env as Record<string, string | undefined>)[k]
    }
  })

  it('accepts any provider string (not restricted to an enum)', async () => {
    const env = await loadEnv({ AI_PROVIDER: 'CEREBRAS' })
    expect(env.AI_PROVIDER).toBe('CEREBRAS')
  })

  it('defaults to GEMINI when unset', async () => {
    const env = await loadEnv({ AI_PROVIDER: undefined })
    expect(env.AI_PROVIDER).toBe('GEMINI')
  })

  it('throws an aggregated error when a required core var is missing', async () => {
    await expect(loadEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined })).rejects.toThrow(
      /Invalid server environment variables/
    )
  })
})
