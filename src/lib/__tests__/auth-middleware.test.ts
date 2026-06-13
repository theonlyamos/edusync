import { describe, it, expect } from 'vitest'
import { getAuthModeForPath } from '@/lib/auth-middleware'

// getAuthModeForPath decides the auth posture of every /api route. A regression
// here silently changes which routes are public vs protected.
describe('getAuthModeForPath', () => {
  it('returns explicit modes for exact matches', () => {
    expect(getAuthModeForPath('/api/livekit/webhook')).toBe('none')
    expect(getAuthModeForPath('/api/embed/keys')).toBe('session')
    expect(getAuthModeForPath('/api/embed/sessions')).toBe('apiKey')
    expect(getAuthModeForPath('/api/credits/deduct-minute')).toBe('both')
    expect(getAuthModeForPath('/api/feedback')).toBe('both')
  })

  it('matches single-segment wildcards', () => {
    expect(getAuthModeForPath('/api/embed/keys/abc-123')).toBe('session')
    expect(getAuthModeForPath('/api/embed/sessions/some-id')).toBe('apiKey')
    expect(getAuthModeForPath('/api/learning/sessions/xyz')).toBe('both')
    expect(getAuthModeForPath('/api/auth/provision')).toBe('none')
  })

  it('matches nested wildcard patterns', () => {
    expect(getAuthModeForPath('/api/learning/sessions/xyz/recordings')).toBe('both')
    expect(getAuthModeForPath('/api/learning/sessions/xyz/recordings/rec-1')).toBe('both')
  })

  it('wildcards do not cross path segments', () => {
    // '/api/embed/keys/*' must not match deeper paths
    expect(getAuthModeForPath('/api/embed/keys/a/b')).toBe('session') // falls through to default
  })

  it('defaults to session auth for unknown API paths (fail closed)', () => {
    expect(getAuthModeForPath('/api/admin/users/admins')).toBe('session')
    expect(getAuthModeForPath('/api/some/new/route')).toBe('session')
    expect(getAuthModeForPath('/api/upload')).toBe('session')
  })

  it('agent persistence endpoints are explicitly unauthenticated at the proxy (route-level secret)', () => {
    expect(getAuthModeForPath('/api/live-classes/agent/persist-visualization')).toBe('none')
    expect(getAuthModeForPath('/api/live-classes/agent/persist-session-topic')).toBe('none')
  })
})
