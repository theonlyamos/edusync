import { describe, it, expect, vi } from 'vitest'
import { isDomainAllowed, enforceApiKeyRateLimit } from '@/lib/api-key-auth'

describe('isDomainAllowed', () => {
  it('allows everything when the whitelist is null or empty', () => {
    expect(isDomainAllowed('anything.com', null)).toBe(true)
    expect(isDomainAllowed('anything.com', undefined)).toBe(true)
    expect(isDomainAllowed('anything.com', [])).toBe(true)
  })

  it('matches exact domains', () => {
    expect(isDomainAllowed('example.com', ['example.com'])).toBe(true)
    expect(isDomainAllowed('other.com', ['example.com'])).toBe(false)
  })

  it('matches wildcard subdomains', () => {
    expect(isDomainAllowed('app.example.com', ['*.example.com'])).toBe(true)
    expect(isDomainAllowed('deep.app.example.com', ['*.example.com'])).toBe(true)
    expect(isDomainAllowed('example.com', ['*.example.com'])).toBe(true)
  })

  it('does not allow suffix-bypass of wildcards', () => {
    // Regression test: 'evilexample.com'.endsWith('example.com') is true,
    // but it is NOT a subdomain of example.com.
    expect(isDomainAllowed('evilexample.com', ['*.example.com'])).toBe(false)
    expect(isDomainAllowed('notexample.com', ['*.example.com'])).toBe(false)
  })
})

// Chainable mock for: from().select(count).eq().gte()
function supabaseWithCounts(counts: Array<number | null>) {
  let call = 0
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: async () => {
            const count = counts[call++]
            return count === null
              ? { count: null, error: { message: 'db error' } }
              : { count, error: null }
          },
        }),
      }),
    }),
  }
}

describe('enforceApiKeyRateLimit', () => {
  it('allows requests under both limits', async () => {
    const supabase = supabaseWithCounts([5, 50]) // hour, day
    const result = await enforceApiKeyRateLimit(supabase, 'key-1', 100, 1000)
    expect(result.allowed).toBe(true)
  })

  it('blocks when the hourly limit is reached', async () => {
    const supabase = supabaseWithCounts([100])
    const result = await enforceApiKeyRateLimit(supabase, 'key-1', 100, 1000)
    expect(result.allowed).toBe(false)
    expect(result.error).toContain('Hourly rate limit')
  })

  it('blocks when the daily limit is reached', async () => {
    const supabase = supabaseWithCounts([5, 1000])
    const result = await enforceApiKeyRateLimit(supabase, 'key-1', 100, 1000)
    expect(result.allowed).toBe(false)
    expect(result.error).toContain('Daily rate limit')
  })

  it('skips disabled limits (null or 0)', async () => {
    const supabase = { from: vi.fn() }
    const result = await enforceApiKeyRateLimit(supabase, 'key-1', null, 0)
    expect(result.allowed).toBe(true)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('fails open (with logging) when the usage count query errors', async () => {
    const supabase = supabaseWithCounts([null, null])
    const result = await enforceApiKeyRateLimit(supabase, 'key-1', 100, 1000)
    expect(result.allowed).toBe(true)
  })
})
