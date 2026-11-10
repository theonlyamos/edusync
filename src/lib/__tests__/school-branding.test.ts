import { describe, expect, it } from 'vitest'
import { parseHexColor } from '@/lib/embed-theme'
import {
  BRANDING_PRESETS,
  PRIMARY_MIN_CONTRAST,
  SECONDARY_MIN_CONTRAST,
  brandingColors,
  brandingStylesheet,
  brandingTokens,
  contrastRatio,
  isLogoPathFor,
  parseBrandingInput,
  readStoredBranding,
  readableTokens,
} from '@/lib/school-branding'
import { sniffLogoType } from '@/lib/school-branding.server'
import { buildSchoolAccountEmail } from '@/lib/school-account-email'

const SCHOOL = '00000000-0000-4000-8000-0000000000b1'
const OTHER = '00000000-0000-4000-8000-0000000000b2'
const logo = `${SCHOOL}/logo-11111111-2222-4333-8444-555555555555.png`
const LIGHT_BG: [number, number, number] = [250, 248, 244]
const DARK_BG: [number, number, number] = [28, 23, 18]

describe('stored branding', () => {
  it('falls back to the default for anything odd', () => {
    for (const bad of [null, 'x', [], 5]) {
      expect(readStoredBranding(bad, SCHOOL)).toEqual({ preset: 'default', primary: null, secondary: null, mode: null, logoPath: null })
    }
    expect(readStoredBranding({ preset: 'nope', mode: 'neon' }, SCHOOL)).toMatchObject({ preset: 'default', mode: null })
  })

  it('keeps a custom theme only with both colours', () => {
    expect(readStoredBranding({ preset: 'custom', primary: '#112233', secondary: 'ABC' }, SCHOOL))
      .toMatchObject({ preset: 'custom', primary: '#112233', secondary: '#aabbcc' })
    expect(readStoredBranding({ preset: 'custom', primary: '#112233' }, SCHOOL).preset).toBe('default')
    expect(readStoredBranding({ preset: 'navy', primary: '#112233', secondary: '#445566' }, SCHOOL))
      .toMatchObject({ preset: 'navy', primary: null, secondary: null })
  })

  it('only trusts a logo in the school’s own folder', () => {
    expect(readStoredBranding({ logoPath: logo }, SCHOOL).logoPath).toBe(logo)
    expect(readStoredBranding({ logoPath: logo }, OTHER).logoPath).toBeNull()
    for (const path of ['https://evil.test/x.png', `${SCHOOL}/../x.png`, `${SCHOOL}/logo-1.svg`]) {
      expect(isLogoPathFor(path, SCHOOL)).toBe(false)
    }
  })
})

describe('branding input', () => {
  it('accepts presets and custom colours', () => {
    expect(parseBrandingInput({ preset: 'forest', mode: 'light' })).toEqual({ ok: true, value: { preset: 'forest', primary: null, secondary: null, mode: 'light' } })
    expect(parseBrandingInput({ preset: 'custom', primary: '1E3A8A', secondary: '#fa0', mode: null }))
      .toEqual({ ok: true, value: { preset: 'custom', primary: '#1e3a8a', secondary: '#ffaa00', mode: null } })
  })

  it('rejects bad input', () => {
    expect(parseBrandingInput(null).ok).toBe(false)
    expect(parseBrandingInput({ preset: 'custom', primary: '#123456' }).ok).toBe(false)
    expect(parseBrandingInput({ preset: 'custom', primary: 'red;}', secondary: '#123456' }).ok).toBe(false)
    expect(parseBrandingInput({ preset: 'mystery' }).ok).toBe(false)
    expect(parseBrandingInput({ preset: 'navy', mode: 'sepia' }).ok).toBe(false)
  })
})

describe('readable colours', () => {
  it('darkens a pale colour on light pages and lightens a dark one on dark pages', () => {
    const yellow = readableTokens('#ffe066', 'light', PRIMARY_MIN_CONTRAST)
    expect(yellow.adjusted).toBe(true)
    expect(contrastRatio(parseHexColor(yellow.hex)!, LIGHT_BG)).toBeGreaterThanOrEqual(PRIMARY_MIN_CONTRAST - 0.2)
    const navy = readableTokens('#0b1d4f', 'dark', PRIMARY_MIN_CONTRAST)
    expect(navy.adjusted).toBe(true)
    expect(contrastRatio(parseHexColor(navy.hex)!, DARK_BG)).toBeGreaterThanOrEqual(PRIMARY_MIN_CONTRAST - 0.2)
  })

  it('leaves a colour that already reads well alone', () => {
    expect(readableTokens('#1e3a8a', 'light', PRIMARY_MIN_CONTRAST).adjusted).toBe(false)
  })

  it('picks text that reads on the colour', () => {
    expect(readableTokens('#1e3a8a', 'light', PRIMARY_MIN_CONTRAST).foreground).toBe('0 0% 100%')
    expect(readableTokens('#ffe066', 'dark', SECONDARY_MIN_CONTRAST).foreground).toBe('0 0% 9%')
  })

  it('makes every preset readable in both looks', () => {
    for (const preset of BRANDING_PRESETS) {
      const tokens = brandingTokens(preset)
      for (const [look, bg] of [['light', LIGHT_BG], ['dark', DARK_BG]] as const) {
        expect(contrastRatio(parseHexColor(tokens[look].primary.hex)!, bg)).toBeGreaterThanOrEqual(PRIMARY_MIN_CONTRAST - 0.2)
        expect(contrastRatio(parseHexColor(tokens[look].secondary.hex)!, bg)).toBeGreaterThanOrEqual(SECONDARY_MIN_CONTRAST - 0.2)
      }
    }
  })
})

describe('stylesheet', () => {
  it('is empty for the InsyteAI default', () => {
    expect(brandingColors({ preset: 'default', primary: null, secondary: null })).toBeNull()
    expect(brandingStylesheet({ preset: 'default', primary: null, secondary: null })).toBe('')
  })

  it('sets primary and secondary for light and dark', () => {
    const css = brandingStylesheet({ preset: 'custom', primary: '#1e3a8a', secondary: '#d4a017' })
    expect(css).toMatch(/^:root\{--primary:[^;]+;--primary-foreground:[^;]+;--ring:[^;]+;--accent:[^;]+;--accent-foreground:[^;]+;\}:root\.dark,\.dark\{/)
    expect(css).not.toMatch(/[<>"']/)
  })
})

describe('logo files', () => {
  it('recognises PNG, JPEG and WebP by their bytes', () => {
    expect(sniffLogoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext).toBe('png')
    expect(sniffLogoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg')
    expect(sniffLogoType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))?.ext).toBe('webp')
    expect(sniffLogoType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
  })
})

describe('account email branding', () => {
  const base = {
    kind: 'activate' as const,
    schoolName: 'Hilltop',
    senderName: null,
    personName: null,
    role: 'teacher',
    gradeLevel: null,
    email: 'a@x.co',
    url: 'https://app.test/activate/abc',
    expiresAt: new Date('2026-10-29T12:00:00Z'),
  }

  it('shows the school logo and button colour', () => {
    const html = buildSchoolAccountEmail({ ...base, logoUrl: 'https://cdn.test/logo.png', buttonColor: '#1e3a8a', buttonTextColor: '#ffffff' }).html
    expect(html).toContain('<img src="https://cdn.test/logo.png" alt="Hilltop"')
    expect(html).toContain('background:#1e3a8a;color:#ffffff')
  })

  it('ignores unsafe values and keeps the default look', () => {
    const html = buildSchoolAccountEmail({ ...base, logoUrl: 'javascript:alert(1)', buttonColor: 'red;x:y' }).html
    expect(html).not.toContain('<img')
    expect(html).toContain('background:#4f46e5;color:#ffffff')
  })
})
