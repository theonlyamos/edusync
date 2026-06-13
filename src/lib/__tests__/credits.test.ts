import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Supabase server client factory; each test wires rpc/from behavior.
const rpcMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/supabase.server', () => ({
  createServerSupabase: () => ({
    rpc: rpcMock,
    from: fromMock,
  }),
}))

import { deductCreditsForMinute, addCredits } from '@/lib/credits'

function mockBalanceQuery(credits: number | null) {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: async () => (credits === null
          ? { data: null, error: { message: 'not found' } }
          : { data: { credits }, error: null }),
      }),
    }),
  })
}

beforeEach(() => {
  rpcMock.mockReset()
  fromMock.mockReset()
})

describe('deductCreditsForMinute', () => {
  it('succeeds and returns the new balance from the atomic RPC', async () => {
    rpcMock.mockResolvedValue({ data: 41, error: null })

    const result = await deductCreditsForMinute('user-1', 'session-1')

    expect(result).toEqual({ success: true, remainingCredits: 41 })
    expect(rpcMock).toHaveBeenCalledWith('deduct_user_credits', {
      p_user_id: 'user-1',
      p_amount: 1,
      p_description: 'Used 1 credit for 1 minute of AI session',
      p_session_id: 'session-1',
    })
  })

  it('reports insufficient credits when the RPC returns null', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    mockBalanceQuery(0)

    const result = await deductCreditsForMinute('user-1', 'session-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Insufficient credits')
    expect(result.remainingCredits).toBe(0)
  })

  it('fails safely when the RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'db down' } })

    const result = await deductCreditsForMinute('user-1', 'session-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to update credits')
  })
})

describe('addCredits', () => {
  it('adds credits via the atomic RPC and returns the new total', async () => {
    rpcMock.mockResolvedValue({ data: 160, error: null })

    const result = await addCredits('user-1', 100, 'Purchased 100 credits', 'purchase', 'pi_123')

    expect(result).toEqual({ success: true, newTotal: 160 })
    expect(rpcMock).toHaveBeenCalledWith('add_user_credits', {
      p_user_id: 'user-1',
      p_amount: 100,
      p_description: 'Purchased 100 credits',
      p_type: 'purchase',
      p_payment_intent_id: 'pi_123',
    })
  })

  it('reports user-not-found when the RPC returns null', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })

    const result = await addCredits('ghost', 10, 'bonus', 'bonus')

    expect(result.success).toBe(false)
    expect(result.error).toBe('User not found')
  })

  it('fails safely when the RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'db down' } })

    const result = await addCredits('user-1', 10, 'bonus', 'bonus')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to update credits')
  })
})
