import { describe, expect, it } from 'vitest'
import { canSetHand, compareHands, handAttribute, handRaisedAt } from '@/lib/live-class-hand'

describe('raised hands', () => {
  it('reads a raised hand from participant attributes', () => {
    expect(handRaisedAt({ hand: '1700000000000' })).toBe(1700000000000)
    expect(handRaisedAt({ hand: '' })).toBeNull()
    expect(handRaisedAt({ hand: 'yes' })).toBeNull()
    expect(handRaisedAt({})).toBeNull()
    expect(handRaisedAt(undefined)).toBeNull()
  })

  it('writes the time when a hand goes up and clears it when it goes down', () => {
    expect(handAttribute(true, 42)).toEqual({ hand: '42' })
    expect(handAttribute(false, 42)).toEqual({ hand: '' })
    expect(handRaisedAt(handAttribute(true, 42))).toBe(42)
  })

  it('lets people set their own hand and only the host lower another', () => {
    expect(canSetHand({ callerId: 's1', hostId: 't', targetId: 's1', raised: true })).toBe(true)
    expect(canSetHand({ callerId: 's1', hostId: 't', targetId: 's1', raised: false })).toBe(true)
    expect(canSetHand({ callerId: 't', hostId: 't', targetId: 's1', raised: false })).toBe(true)
    expect(canSetHand({ callerId: 't', hostId: 't', targetId: 's1', raised: true })).toBe(false)
    expect(canSetHand({ callerId: 's2', hostId: 't', targetId: 's1', raised: false })).toBe(false)
    expect(canSetHand({ callerId: 's2', hostId: null, targetId: 's1', raised: false })).toBe(false)
  })

  it('orders raised hands first, earliest first', () => {
    expect([null, 30, null, 10, 20].sort(compareHands)).toEqual([10, 20, 30, null, null])
  })
})
