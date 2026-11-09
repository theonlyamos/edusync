import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { copyLesson, publishedObjectives } from '@/lib/lesson-library.server'

describe('publishedObjectives', () => {
  it('reads objectives from a snapshot in their published order', () => {
    expect(publishedObjectives([
      { id: 'b', text: ' Second ', position: 1, revision: 2, artifactIds: ['x', 7, 'y'] },
      { id: 'a', text: 'First', position: 0, revision: 1 },
    ])).toEqual([
      { id: 'a', text: 'First', position: 0, artifactIds: [] },
      { id: 'b', text: 'Second', position: 1, artifactIds: ['x', 'y'] },
    ])
  })

  it('refuses a snapshot it cannot trust', () => {
    expect(publishedObjectives(undefined)).toBeNull()
    expect(publishedObjectives('[]')).toBeNull()
    expect(publishedObjectives([{ id: 'a', text: '  ' }])).toBeNull()
    expect(publishedObjectives([{ text: 'No id' }])).toBeNull()
    expect(publishedObjectives([null])).toBeNull()
  })
})

// A tiny stand-in for the database: each table answers every query with its rows.
function fakeDb(tables: Record<string, unknown[]>) {
  const inserted: Record<string, unknown[]> = {}
  const updates: { table: string; values: unknown }[] = []
  const from = (table: string) => {
    const rows = tables[table] ?? []
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'neq', 'is', 'not', 'in', 'order', 'limit']) chain[method] = () => chain
    chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null })
    chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null })
    chain.insert = async (values: unknown[]) => { inserted[table] = values; return { error: null } }
    chain.update = (values: unknown) => { updates.push({ table, values }); return chain }
    chain.delete = () => chain
    return chain
  }
  const rpc = vi.fn(async () => ({ data: 'new-lesson', error: null }))
  return { db: { from, rpc } as never, rpc, inserted, updates }
}

const LESSON = '11111111-1111-4111-8111-111111111111'
const viewer = { userId: 'me', schoolId: 'school' }
const artifact = (id: string, kind: string, objective: string) => ({ id, objective_id: objective, series_id: `s-${id}`, version: 1, objective_revision: 1, kind, position: 0, payload: { kind }, source: null, validation_report: null })

describe('copyLesson', () => {
  it('copies a colleague’s lesson as it was published, not as it stands now', async () => {
    const { db, rpc, inserted, updates } = fakeDb({
      teachers: [{ id: 'my-teacher-row' }],
      lessons: [{ id: LESSON, title: 'Edited since', subject: 'Edited', gradelevel: 'jhs 2', objectives: [], content: 'Unpublished body', teacher_id: 'colleague', visual_instructions: 'private notes', current_publication_id: 'pub', archived_at: null }],
      lesson_publications: [{ manifest: {
        lesson: { title: 'Photosynthesis', subject: 'Science', gradeLevel: 'jhs 1', content: 'Published body' },
        objectives: [{ id: 'o1', text: 'Inputs and outputs', position: 0, revision: 1, artifactIds: ['a1', 'a2', 'a3'] }],
      } }],
      lesson_artifacts: [artifact('a1', 'structured_quiz', 'o1'), artifact('a2', 'generated_image', 'o1'), artifact('a3', 'interactive_visualization', 'o1')],
      lesson_objectives: [{ id: 'new-o1', position: 0, revision: 1 }],
    })
    const copy = await copyLesson(db, viewer, LESSON)
    expect(copy).toEqual({ id: 'new-lesson', title: 'Photosynthesis (copy)', copiedActivities: 2, skippedMedia: 1 })
    expect(rpc).toHaveBeenCalledWith('create_lesson_draft', expect.objectContaining({ p_title: 'Photosynthesis (copy)', p_subject: 'Science', p_grade_level: 'jhs 1', p_content: 'Published body', p_objectives: ['Inputs and outputs'], p_owner_user_id: 'me' }))
    expect(inserted.lesson_artifacts).toHaveLength(2)
    expect(inserted.lesson_artifacts[0]).toMatchObject({ lesson_id: 'new-lesson', objective_id: 'new-o1', status: 'approved', version: 1, created_by: 'me' })
    // The author's private notes are not part of what was published.
    expect(updates).toEqual([])
  })

  it('hides a colleague’s draft and a snapshot that cannot be read', async () => {
    const lesson = { id: LESSON, title: 'Draft', subject: 'S', gradelevel: 'jhs 1', objectives: ['x'], content: null, teacher_id: 'colleague', visual_instructions: null, current_publication_id: null, archived_at: null }
    await expect(copyLesson(fakeDb({ teachers: [{ id: 't' }], lessons: [lesson] }).db, viewer, LESSON)).rejects.toMatchObject({ status: 404 })
    await expect(copyLesson(fakeDb({ teachers: [{ id: 't' }], lessons: [{ ...lesson, current_publication_id: 'pub' }], lesson_publications: [{ manifest: {} }] }).db, viewer, LESSON)).rejects.toMatchObject({ status: 409 })
    await expect(copyLesson(fakeDb({ teachers: [{ id: 't' }], lessons: [] }).db, viewer, 'not-an-id')).rejects.toMatchObject({ status: 404 })
    await expect(copyLesson(fakeDb({ teachers: [] }).db, viewer, LESSON)).rejects.toMatchObject({ status: 403 })
  })
})
