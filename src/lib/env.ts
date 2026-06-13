import { z } from 'zod'

/**
 * Validated server-side environment access.
 *
 * Server-only module. Do NOT import from client components — read
 * `process.env.NEXT_PUBLIC_*` literally there so Next.js can inline them at
 * build time (a dynamic lookup through this module would not be inlined).
 *
 * Validation is lazy and memoized: it runs on the first `env()` call at
 * runtime, not at import. This keeps `next build` working without a populated
 * environment (build-time page collection never triggers it).
 *
 * Optionality reflects reality: only the Supabase core is required in every
 * deployment. Per-feature integrations (Stripe, LiveKit, AI providers) are
 * optional in the schema; call sites that truly need one use `requireEnv()`
 * to fail loudly with a named error.
 */
const serverEnvSchema = z.object({
  // ── Core: required in every deployment ──
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // ── AI providers (Gemini primary, OpenAI fallback) ──
  AI_PROVIDER: z.enum(['GEMINI', 'OPENAI']).default('GEMINI'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_BASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().optional(),
  HELICONE_API_KEY: z.string().optional(),
  HELICONE_BASE_URL: z.string().url().optional(),

  // ── Stripe (credits / payments) ──
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CREDIT_PRODUCT_ID: z.string().optional(),
  STRIPE_CREDIT_PRICE_ID: z.string().optional(),

  // ── LiveKit (live classes) ──
  LIVEKIT_URL: z.string().optional(),
  NEXT_PUBLIC_LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_AGENT_NAME: z.string().optional(),
  LIVEKIT_WEBHOOK_SECRET: z.string().optional(),
  LIVE_CLASS_AGENT_SECRET: z.string().optional(),

  // ── Misc ──
  TAVILY_API_KEY: z.string().optional(),
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
  LIVE_CLASS_LOBBY_MINUTES: z.coerce.number().int().positive().optional(),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | null = null

/** Returns the validated environment, throwing an aggregated error if the core is invalid. */
export function env(): ServerEnv {
  if (cached) return cached
  const parsed = serverEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid server environment variables:\n${issues}`)
  }
  cached = parsed.data
  return cached
}

/** Reads an optional env var, throwing a clear named error when the call site requires it. */
export function requireEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = env()[key]
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${String(key)}`)
  }
  return value as NonNullable<ServerEnv[K]>
}
