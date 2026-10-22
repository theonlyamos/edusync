import { GRADE_LEVELS } from '@/lib/constants'

/** Where a grade's students go at the end of the year. */
export type PromotionTarget = string | 'graduate' | 'keep'
export type PromotionPlan = Record<string, PromotionTarget>

function gradeOrder(grade: string): number {
  const i = (GRADE_LEVELS as readonly string[]).indexOf(grade)
  return i === -1 ? 999 : i
}

/** The school's grades from youngest to oldest. */
export function sortGrades(grades: readonly string[]): string[] {
  return [...new Set(grades)].sort((a, b) => gradeOrder(a) - gradeOrder(b) || a.localeCompare(b))
}

/** Everyone moves up one of the school's grades, and the top grade graduates. */
export function defaultPromotionPlan(schoolGrades: readonly string[]): PromotionPlan {
  const grades = sortGrades(schoolGrades)
  const plan: PromotionPlan = {}
  grades.forEach((grade, i) => {
    plan[grade] = i + 1 < grades.length ? grades[i + 1] : 'graduate'
  })
  return plan
}

/** Checks a plan the browser sent. Returns an error message, or null when it's fine. */
export function validatePromotionPlan(plan: unknown, schoolGrades: readonly string[]): string | null {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return 'Send a plan for each grade'
  const grades = new Set(schoolGrades)
  const entries = Object.entries(plan as Record<string, unknown>)
  if (entries.length === 0) return 'Send a plan for each grade'
  for (const [from, to] of entries) {
    if (!grades.has(from)) return `${from} isn’t one of your school’s grades`
    if (typeof to !== 'string') return 'Each grade needs somewhere to go'
    if (to !== 'graduate' && to !== 'keep' && !grades.has(to)) return `${to} isn’t one of your school’s grades`
  }
  return null
}

export type PromotionStudent = { memberId: string; userId: string; grade: string | null }

export type PromotionResult = {
  /** New grade → the students moving into it. */
  moves: Map<string, PromotionStudent[]>
  graduates: PromotionStudent[]
  unchanged: number
}

/**
 * Works out where each student goes, from one snapshot of their grades.
 * Planning everyone first means "Grade 1 → 2" and "Grade 2 → 3" never move the same student twice.
 */
export function planPromotion(students: readonly PromotionStudent[], plan: PromotionPlan): PromotionResult {
  const moves = new Map<string, PromotionStudent[]>()
  const graduates: PromotionStudent[] = []
  let unchanged = 0
  for (const student of students) {
    const target = student.grade ? plan[student.grade] : undefined
    if (!target || target === 'keep' || target === student.grade) {
      unchanged += 1
    } else if (target === 'graduate') {
      graduates.push(student)
    } else {
      const list = moves.get(target) ?? []
      list.push(student)
      moves.set(target, list)
    }
  }
  return { moves, graduates, unchanged }
}
