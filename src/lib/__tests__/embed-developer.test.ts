import { describe, expect, it } from 'vitest'
import { luminance, parseEmbedTheme, parseHexColor, toHslTriplet } from '@/lib/embed-theme'
import { toUsageDays, usageDayLabel, usageTotals } from '@/lib/embed-usage'

const params = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null })

describe('embed theme', () => {
  it('reads hex colours with or without the hash, short or long', () => {
    expect(parseHexColor('#1d4ed8')).toEqual([29, 78, 216])
    expect(parseHexColor('1D4ED8')).toEqual([29, 78, 216])
    expect(parseHexColor('#fff')).toEqual([255, 255, 255])
    for (const bad of ['', 'red', '#12', '#1234567', 'url(x)', '1d4ed8;color:red', null]) expect(parseHexColor(bad)).toBeNull()
  })

  it('converts to the H S% L% form', () => {
    expect(toHslTriplet([255, 0, 0])).toBe('0 100% 50%')
    expect(toHslTriplet([0, 0, 0])).toBe('0 0% 0%')
    expect(toHslTriplet([255, 255, 255])).toBe('0 0% 100%')
    expect(toHslTriplet([29, 78, 216])).toBe('224 76% 48%')
  })

  it('picks readable text for the accent', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1)
    expect(parseEmbedTheme(params({ accent: '1d4ed8' })).accent).toEqual({ primary: '224 76% 48%', foreground: '0 0% 100%' })
    expect(parseEmbedTheme(params({ accent: 'fde047' })).accent?.foreground).toBe('0 0% 9%')
  })

  it('ignores anything it does not recognise', () => {
    expect(parseEmbedTheme(params({}))).toEqual({ mode: null, accent: null })
    expect(parseEmbedTheme(params({ theme: 'neon', accent: 'javascript:alert(1)' }))).toEqual({ mode: null, accent: null })
    expect(parseEmbedTheme(params({ theme: 'dark' })).mode).toBe('dark')
  })
})

describe('key usage', () => {
  it('cleans rows from the database', () => {
    expect(toUsageDays([{ day: '2026-11-08', requests: '12', sessions: 3 }, { day: '2026-11-09T00:00:00', requests: -4, sessions: null }, { day: 'soon' }, null])).toEqual([
      { day: '2026-11-08', requests: 12, sessions: 3 },
      { day: '2026-11-09', requests: 0, sessions: 0 },
    ])
    expect(toUsageDays(null)).toEqual([])
  })

  it('totals a period', () => {
    const days = [{ day: '2026-11-07', requests: 0, sessions: 0 }, { day: '2026-11-08', requests: 12, sessions: 3 }, { day: '2026-11-09', requests: 5, sessions: 1 }]
    expect(usageTotals(days)).toEqual({ requests: 17, sessions: 4, busiest: days[1], activeDays: 2 })
    expect(usageTotals([days[0]]).busiest).toBeNull()
  })

  it('labels a day without shifting it', () => {
    expect(usageDayLabel('2026-11-09')).toBe('9 Nov')
  })
})
