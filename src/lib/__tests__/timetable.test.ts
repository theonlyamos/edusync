import { describe, expect, it } from 'vitest'
import { nextPeriodSlot, readTimetable, teacherSlots, validateTimetable } from '@/lib/timetable'

const teachers = new Set(['t1', 't2'])
const period = (id: string, startTime: string, endTime: string) => ({ id, startTime, endTime })

describe('validateTimetable', () => {
  it('keeps valid periods in time order and real cells', () => {
    const result = validateTimetable({
      periods: [period('b', '09:00', '10:00'), period('a', '08:00', '09:00')],
      schedule: { Monday: { a: { subject: ' Maths ', teacherId: 't1' }, b: { subject: '', teacherId: '' } } },
    }, teachers)
    expect(result).toEqual({
      ok: true,
      value: {
        periods: [period('a', '08:00', '09:00'), period('b', '09:00', '10:00')],
        schedule: { Monday: { a: { subject: 'Maths', teacherId: 't1' } } },
      },
    })
  })

  it('rejects bad times, overlaps and unknown days', () => {
    expect(validateTimetable({ periods: [period('a', '8am', '09:00')] }, teachers).ok).toBe(false)
    expect(validateTimetable({ periods: [period('a', '09:00', '08:00')] }, teachers).ok).toBe(false)
    expect(validateTimetable({ periods: [period('a', '08:00', '09:00'), period('b', '08:30', '09:30')] }, teachers).ok).toBe(false)
    expect(validateTimetable({ periods: [period('a', '08:00', '09:00'), period('a', '10:00', '11:00')] }, teachers).ok).toBe(false)
    expect(validateTimetable({ periods: [period('a', '08:00', '09:00')], schedule: { Sunday: {} } }, teachers).ok).toBe(false)
  })

  it('drops teachers from outside the school and slots for removed periods', () => {
    const result = validateTimetable({
      periods: [period('a', '08:00', '09:00')],
      schedule: { Monday: { a: { subject: 'Art', teacherId: 'stranger' }, gone: { subject: 'PE', teacherId: 't1' } } },
    }, teachers)
    expect(result).toEqual({ ok: true, value: { periods: [period('a', '08:00', '09:00')], schedule: { Monday: { a: { subject: 'Art', teacherId: '' } } } } })
  })
})

describe('readTimetable', () => {
  it('tolerates empty and older rows', () => {
    expect(readTimetable(null)).toEqual({ periods: [], schedule: {} })
    expect(readTimetable({ periods: [period('a', '08:00', '09:00'), { id: 'x' }], schedule: { Monday: { a: { subject: 'Maths', teacherId: 't1', lessonId: 'l' } } } }))
      .toEqual({ periods: [period('a', '08:00', '09:00')], schedule: { Monday: { a: { subject: 'Maths', teacherId: 't1' } } } })
  })
})

describe('teacherSlots', () => {
  it('collects one teacher’s slots across grades without clashing ids', () => {
    const slots = teacherSlots([
      { grade: 'primary 1', timetable: { periods: [period('a', '08:00', '09:00'), period('b', '09:00', '10:00')], schedule: { Monday: { a: { subject: 'Maths', teacherId: 't1' }, b: { subject: 'Art', teacherId: 't2' } } } } },
      { grade: 'primary 2', timetable: { periods: [period('a', '07:00', '08:00')], schedule: { Friday: { a: { subject: 'English', teacherId: 't1' } } } } },
    ], 't1')
    expect(slots.periods.map((p) => p.id)).toEqual(['primary 2:a', 'primary 1:a'])
    expect(slots.schedule).toEqual({
      Monday: { 'primary 1:a': { subject: 'Maths', teacherId: 't1', level: 'primary 1' } },
      Friday: { 'primary 2:a': { subject: 'English', teacherId: 't1', level: 'primary 2' } },
    })
  })
})

describe('nextPeriodSlot', () => {
  it('starts at 08:00 and follows the last period', () => {
    expect(nextPeriodSlot([])).toEqual({ startTime: '08:00', endTime: '09:00' })
    expect(nextPeriodSlot([period('a', '08:00', '08:40')])).toEqual({ startTime: '08:40', endTime: '09:40' })
  })
})
