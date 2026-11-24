import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: vi.fn() }));

import { getServerSession } from '@/lib/auth';
import { LessonNotesError, getLessonNotes, removeLessonNotes, requireNotesStudent, saveLessonNotes, type LessonNotesActor } from '@/lib/lesson-notes.server';

const me = '00000000-0000-4000-8000-000000000001';
const someoneElse = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-0000000000aa';
const notesId = '00000000-0000-4000-8000-0000000000bb';
const goodNotes = { pages: [{ title: 'Fractions', items: [{ kind: 'text', text: 'Bottoms must match' }] }], cards: [{ front: 'Q', back: 'A' }] };

/** A stand-in for the database that records the filters and writes it is given. */
function fakeDb(rows: { session?: unknown; notes?: unknown; deleted?: unknown[] }) {
  const calls: { table: string; op: string; values?: unknown; filters: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const call = { table, op: 'select', values: undefined as unknown, filters: {} as Record<string, unknown> };
    calls.push(call);
    const answer = () => {
      if (call.op === 'upsert') return { data: { id: notesId }, error: null };
      if (call.op === 'delete') return { data: rows.deleted ?? [], error: null };
      return { data: table === 'learning_sessions' ? rows.session ?? null : rows.notes ?? null, error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      upsert: (values: unknown) => { call.op = 'upsert'; call.values = values; return chain; },
      delete: () => { call.op = 'delete'; return chain; },
      eq: (column: string, value: unknown) => { call.filters[column] = value; return chain; },
      maybeSingle: async () => answer(),
      single: async () => answer(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(answer()).then(resolve),
    };
    return chain;
  };
  return { actor: { supabase: { from }, userId: me } as unknown as LessonNotesActor, calls };
}

const status = async (work: Promise<unknown>) => {
  try { await work; return 200; } catch (error) { return error instanceof LessonNotesError ? error.status : 500; }
};

describe('who can keep lesson notes', () => {
  it('needs a signed-in student', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null as never);
    expect(await status(requireNotesStudent())).toBe(401);
    vi.mocked(getServerSession).mockResolvedValueOnce({ user: { id: me, role: 'teacher' } } as never);
    expect(await status(requireNotesStudent())).toBe(403);
    vi.mocked(getServerSession).mockResolvedValueOnce({ user: { id: me, role: 'student' } } as never);
    expect((await requireNotesStudent()).userId).toBe(me);
  });
});

describe('saving lesson notes', () => {
  it('stores cleaned notes with counts against the student and session', async () => {
    const db = fakeDb({ session: { id: sessionId, user_id: me, topic: 'From the session' } });
    const dirty = { ...goodNotes, pages: [{ ...goodNotes.pages[0], items: [...goodNotes.pages[0].items, { kind: 'photo', src: 'data:x' }, { kind: 'checkpoint', text: 'Half of 8?', choices: ['4', '2'], correct: 0, chosen: 0, result: 'correct' }] }], score: { correct: 50, answered: 50 } };
    expect(await saveLessonNotes(db.actor, sessionId, { notes: dirty, topic: '  Adding   fractions ' })).toEqual({ id: notesId });
    const write = db.calls.find((call) => call.op === 'upsert')!;
    expect(write.table).toBe('lesson_notes');
    expect(write.values).toMatchObject({ student_id: me, learning_session_id: sessionId, topic: 'Adding fractions', boards: 1, cards: 1, checks_correct: 1, checks_answered: 1 });
    const stored = (write.values as { notes: { pages: { items: { kind: string }[] }[] } }).notes;
    expect(stored.pages[0].items.map((item) => item.kind)).toEqual(['text', 'checkpoint']);
    expect(stored).not.toHaveProperty('score');
  });

  it("falls back to the session's topic", async () => {
    const db = fakeDb({ session: { id: sessionId, user_id: me, topic: 'From the session' } });
    await saveLessonNotes(db.actor, sessionId, { notes: goodNotes });
    expect(db.calls.find((call) => call.op === 'upsert')!.values).toMatchObject({ topic: 'From the session' });
  });

  it("refuses another student's session, a missing one and a bad id without writing", async () => {
    for (const session of [{ id: sessionId, user_id: someoneElse, topic: null }, undefined]) {
      const db = fakeDb({ session });
      expect(await status(saveLessonNotes(db.actor, sessionId, { notes: goodNotes }))).toBe(404);
      expect(db.calls.some((call) => call.op === 'upsert')).toBe(false);
    }
    const db = fakeDb({});
    expect(await status(saveLessonNotes(db.actor, 'not-a-uuid', { notes: goodNotes }))).toBe(404);
    expect(db.calls).toHaveLength(0);
  });

  it('refuses empty or junk notes before touching the database', async () => {
    const db = fakeDb({ session: { id: sessionId, user_id: me, topic: null } });
    for (const body of [null, {}, { notes: { pages: [], cards: [] } }, { notes: 'x' }]) {
      expect(await status(saveLessonNotes(db.actor, sessionId, body))).toBe(400);
    }
    expect(db.calls).toHaveLength(0);
  });
});

describe('reading and removing lesson notes', () => {
  const row = { id: notesId, topic: 'Fractions', created_at: '2026-11-24T10:00:00Z', boards: 1, cards: 1, checks_correct: 0, checks_answered: 0, notes: goodNotes };

  it('only looks among the student\'s own notes', async () => {
    const db = fakeDb({ notes: row });
    const opened = await getLessonNotes(db.actor, notesId);
    expect(db.calls[0].filters).toEqual({ id: notesId, student_id: me });
    expect(opened.notes.pages[0].items[0]).toMatchObject({ kind: 'text', settled: true });
    expect(opened).toMatchObject({ id: notesId, topic: 'Fractions', createdAt: '2026-11-24T10:00:00Z' });
  });

  it('answers not found for missing notes, damaged notes and bad ids', async () => {
    expect(await status(getLessonNotes(fakeDb({}).actor, notesId))).toBe(404);
    expect(await status(getLessonNotes(fakeDb({ notes: { ...row, notes: { pages: 'x' } } }).actor, notesId))).toBe(404);
    expect(await status(getLessonNotes(fakeDb({ notes: row }).actor, "1' or '1'='1"))).toBe(404);
  });

  it('removes only the student\'s own notes', async () => {
    const db = fakeDb({ deleted: [{ id: notesId }] });
    await removeLessonNotes(db.actor, notesId);
    expect(db.calls[0]).toMatchObject({ op: 'delete', filters: { id: notesId, student_id: me } });
    expect(await status(removeLessonNotes(fakeDb({ deleted: [] }).actor, notesId))).toBe(404);
  });
});
