import { describe, expect, it } from 'vitest'
import { gradeLevelLabel, parseSchoolDetails, registerSchoolErrorStatus, schoolSetupSteps } from '@/lib/school-registration'

describe('parseSchoolDetails', () => {
  it('trims and keeps grades in the usual order', () => {
    const result = parseSchoolDetails({ name: '  Hilltop  ', country: ' Ghana ', timezone: 'Africa/Accra', gradeLevels: ['jhs 1', 'primary 2', 'jhs 1'] })
    expect(result).toEqual({ ok: true, value: { name: 'Hilltop', country: 'Ghana', timezone: 'Africa/Accra', gradeLevels: ['primary 2', 'jhs 1'] } })
  })

  it('requires a school name unless updating', () => {
    expect(parseSchoolDetails({ name: 'A' }).ok).toBe(false)
    expect(parseSchoolDetails({}).ok).toBe(false)
    expect(parseSchoolDetails({ country: 'Ghana' }, { partial: true })).toEqual({ ok: true, value: { country: 'Ghana' } })
  })

  it('rejects unknown grades and time zones', () => {
    expect(parseSchoolDetails({ name: 'Hilltop', gradeLevels: ['grade 13'] }).ok).toBe(false)
    expect(parseSchoolDetails({ name: 'Hilltop', timezone: 'Mars/Base' }).ok).toBe(false)
  })

  it('clears empty optional fields', () => {
    expect(parseSchoolDetails({ country: ' ', timezone: '' }, { partial: true })).toEqual({ ok: true, value: { country: null, timezone: null } })
  })
})

describe('schoolSetupSteps', () => {
  it('marks people done only with both teachers and students', () => {
    const steps = schoolSetupSteps({ hasDetails: true, gradeCount: 2, teacherCount: 1, studentCount: 0, hasPurchasedCredits: false })
    expect(steps.map((s) => [s.id, s.done])).toEqual([['details', true], ['grades', true], ['people', false], ['credits', false]])
  })
})

describe('helpers', () => {
  it('labels grades', () => {
    expect(gradeLevelLabel('primary 1')).toBe('Primary 1')
    expect(gradeLevelLabel('shs 3')).toBe('SHS 3')
  })

  it('maps register_school errors', () => {
    expect(registerSchoolErrorStatus('42501')).toBe(403)
    expect(registerSchoolErrorStatus('P0001')).toBe(409)
    expect(registerSchoolErrorStatus('XX000')).toBeNull()
  })
})
