import { describe, expect, it } from 'vitest'
import { badgesFor, summarizeAchievements, type AchievementCounts } from '@/lib/achievements'

const none: AchievementCounts = { streak: 0, practiceSets: 0, perfectSets: 0, homeworkHandedIn: 0, assessmentsPassed: 0 }

describe('achievements', () => {
  it('starts with nothing earned and one next badge per kind of effort', () => {
    const summary = summarizeAchievements(none)
    expect(summary.earned).toEqual([])
    expect(summary.next.map((badge) => badge.group).sort()).toEqual(['assessment', 'homework', 'perfect', 'practice', 'streak'])
    expect(summary.total).toBe(badgesFor(none).length)
  })

  it('earns each step once its target is reached', () => {
    const summary = summarizeAchievements({ ...none, streak: 7, practiceSets: 12, homeworkHandedIn: 1 })
    expect(summary.earned.map((badge) => badge.id)).toEqual(['streak-3', 'streak-7', 'practice-1', 'practice-10', 'homework-1'])
  })

  it('puts the closest badge first and caps progress at the target', () => {
    const summary = summarizeAchievements({ ...none, streak: 2, practiceSets: 24 })
    expect(summary.next[0]).toMatchObject({ id: 'practice-25', have: 24, target: 25, earned: false })
    expect(summary.next[1]).toMatchObject({ id: 'streak-3', have: 2 })
    expect(badgesFor({ ...none, practiceSets: 500 }).every((badge) => badge.have <= badge.target)).toBe(true)
  })

  it('words goals for one and for many', () => {
    const badges = badgesFor(none)
    expect(badges.find((badge) => badge.id === 'practice-1')?.goal).toBe('1 practice set')
    expect(badges.find((badge) => badge.id === 'streak-7')?.goal).toBe('7 days in a row')
  })

  it('treats bad counts as zero and leaves no next badge when a ladder is finished', () => {
    const summary = summarizeAchievements({ ...none, streak: Number.NaN, practiceSets: -4, perfectSets: 20 })
    expect(summary.earned.map((badge) => badge.group)).toEqual(['perfect', 'perfect', 'perfect'])
    expect(summary.next.some((badge) => badge.group === 'perfect')).toBe(false)
  })
})
