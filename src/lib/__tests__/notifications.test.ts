import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase.server', () => ({ createServerSupabase: () => { throw new Error('not used'); } }));
vi.mock('@/lib/email', () => ({ isEmailConfigured: () => false, sendEmails: async () => {} }));

import { audienceLabel, timeAgo } from '@/lib/notifications';
import { AnnouncementError, announcementRecipients, listAnnouncements, notify, postAnnouncement } from '@/lib/notifications.server';
import { sendHomeworkNotices } from '@/lib/homework/notices';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let failInsert = false;

/** A small in-memory stand-in for the parts of the Supabase client these functions use. */
function fakeDb() {
  const from = (table: string) => {
    let rows = [...(tables[table] ??= [])];
    let limit = Infinity;
    const result = () => ({ data: rows.slice(0, limit), error: null, count: rows.length });
    const query: Record<string, unknown> = {
      select: () => query,
      eq: (column: string, value: unknown) => { rows = rows.filter((row) => row[column] === value); return query; },
      in: (column: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[column])); return query; },
      is: (column: string, value: unknown) => { rows = rows.filter((row) => (row[column] ?? null) === value); return query; },
      not: (column: string) => { rows = rows.filter((row) => row[column] != null); return query; },
      gte: (column: string, value: string) => { rows = rows.filter((row) => String(row[column] ?? '') >= value); return query; },
      ilike: (column: string, value: string) => { rows = rows.filter((row) => String(row[column] ?? '').toLowerCase() === value.replace(/\\(.)/g, '$1').toLowerCase()); return query; },
      range: (from: number, to: number) => { rows = rows.slice(from, to + 1); return query; },
      order: () => query,
      limit: (n: number) => { limit = n; return query; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'none' } }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      insert: (added: Row | Row[]) => {
        if (failInsert) return { ...query, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'down' } }).then(resolve) };
        const list = (Array.isArray(added) ? added : [added]).map((row, i) => ({ id: `${table}-${tables[table].length + i + 1}`, ...row }));
        tables[table].push(...list);
        rows = list;
        return query;
      },
    };
    return query;
  };
  return { from } as never;
}

const school = 'school-1';
const member = (user_id: string, role: string, is_active = true) => ({ organization_id: school, user_id, role, is_active });

beforeEach(() => {
  failInsert = false;
  tables = {
    organization_members: [member('owner', 'owner'), member('admin', 'admin'), member('t1', 'teacher'), member('t2', 'teacher'), member('s1', 'student'), member('s2', 'student'), member('s3', 'student'), member('gone', 'student', false)],
    students: [{ user_id: 's1', grade: 'JHS 1' }, { user_id: 's2', grade: 'jhs 2' }, { user_id: 's3', grade: 'jhs 1' }],
    school_classes: [{ id: 'c1', organization_id: school, name: 'A', grade: 'jhs 1' }, { id: 'other', organization_id: 'school-2', name: 'Z', grade: 'jhs 1' }],
    school_class_teachers: [{ class_id: 'c1', teacher_id: 't1', organization_id: school }],
    school_class_students: [{ class_id: 'c1', student_id: 's1' }, { class_id: 'c1', student_id: 'gone' }],
    users: [{ id: 'owner', name: 'Ama Owner' }, { id: 't1', name: 'Kofi Teacher' }],
    announcements: [],
    notifications: [],
  };
});

const base = { title: 'Sports day', body: 'Friday at 9', gradeLevel: null, classId: null };
const owner = { userId: 'owner', schoolId: school, schoolRole: 'owner' };
const teacher = { userId: 't1', schoolId: school, schoolRole: 'teacher' };

describe('notify', () => {
  it('drops repeats and links that leave the app', async () => {
    const added = await notify([
      { userId: 's1', kind: 'announcement', title: 'Hi', href: '/students/announcements' },
      { userId: 's1', kind: 'announcement', title: 'Hi', href: '/students/announcements' },
      { userId: 's2', kind: 'announcement', title: '  ', href: 'https://evil.example' },
      { userId: 's3', kind: 'announcement', title: 'Hi', href: '//evil.example' },
    ], fakeDb());
    expect(added).toBe(3);
    expect(tables.notifications.map((row) => row.href)).toEqual(['/students/announcements', null, null]);
    expect(tables.notifications[1].title).toBe('Notification');
  });

  it('never throws when the insert fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    failInsert = true;
    expect(await notify([{ userId: 's1', kind: 'announcement', title: 'Hi' }], fakeDb())).toBe(0);
    log.mockRestore();
  });
});

describe('announcement audience', () => {
  it('sends "everyone" to every active member except the author', async () => {
    expect((await announcementRecipients(fakeDb(), owner, { ...base, audience: 'everyone' })).sort()).toEqual(['admin', 's1', 's2', 's3', 't1', 't2']);
  });

  it('narrows students to one grade whatever the letter case', async () => {
    expect((await announcementRecipients(fakeDb(), owner, { ...base, audience: 'students', gradeLevel: 'JHS 1' })).sort()).toEqual(['s1', 's3']);
  });

  it('lets a teacher post only to a class they teach', async () => {
    expect(await announcementRecipients(fakeDb(), teacher, { ...base, audience: 'students', classId: 'c1' })).toEqual(['s1']);
    await expect(announcementRecipients(fakeDb(), { ...teacher, userId: 't2' }, { ...base, audience: 'students', classId: 'c1' })).rejects.toMatchObject({ status: 403 });
    await expect(announcementRecipients(fakeDb(), teacher, { ...base, audience: 'everyone' })).rejects.toBeInstanceOf(AnnouncementError);
  });

  it('refuses a class from another school', async () => {
    await expect(announcementRecipients(fakeDb(), owner, { ...base, audience: 'students', classId: 'other' })).rejects.toMatchObject({ status: 400 });
  });

  it('saves the post, notifies each person with a link to their own portal, and lists it for them', async () => {
    const result = await postAnnouncement(fakeDb(), owner, { ...base, audience: 'everyone' });
    expect(result.recipients).toBe(6);
    const hrefOf = (id: string) => tables.notifications.find((row) => row.user_id === id)?.href;
    expect(hrefOf('s1')).toBe('/students/announcements');
    expect(hrefOf('t1')).toBe('/teachers/announcements');
    expect(hrefOf('admin')).toBe('/school/announcements');
    expect((await listAnnouncements(fakeDb(), { userId: 's1', schoolId: school, schoolRole: 'student' })).map((a) => a.title)).toEqual(['Sports day']);
    expect((await listAnnouncements(fakeDb(), owner))[0]).toMatchObject({ authorName: 'Ama Owner', recipientCount: 6 });
  });

  it('keeps a class post away from students outside the class', async () => {
    await postAnnouncement(fakeDb(), teacher, { ...base, audience: 'students', classId: 'c1' });
    expect(await listAnnouncements(fakeDb(), { userId: 's2', schoolId: school, schoolRole: 'student' })).toEqual([]);
    expect((await listAnnouncements(fakeDb(), teacher))[0]).toMatchObject({ className: 'A' });
  });
});

describe('homework notices', () => {
  const homework = { id: 'hw-1', title: 'Forces quiz', owner_id: 't1' } as never;
  const send = (extra: Record<string, unknown>) => sendHomeworkNotices({ db: fakeDb(), homework, actorId: 't1', action: 'publish', startedAt: new Date(), ...extra } as never);

  it('tells students about new homework', async () => {
    await send({ recipients: ['s1', 's2'] });
    expect(tables.notifications.map((row) => [row.user_id, row.kind, row.href])).toEqual([
      ['s1', 'homework_assigned', '/students/homework/hw-1'],
      ['s2', 'homework_assigned', '/students/homework/hw-1'],
    ]);
  });

  it('tells the teacher once when work is handed in', async () => {
    await send({ action: 'submit', actorId: 's1', attempt: { student_id: 's1', submitted_at: null } });
    await send({ action: 'submit', actorId: 's1', attempt: { student_id: 's1', submitted_at: '2026-11-09T10:00:00Z' } });
    expect(tables.notifications.map((row) => [row.user_id, row.href])).toEqual([['t1', '/teachers/homework/hw-1/mark']]);
  });

  it('tells only the students whose marks were just released', async () => {
    tables.homework_attempts = [{ id: 'a1', homework_id: 'hw-1', student_id: 's1' }, { id: 'a2', homework_id: 'hw-1', student_id: 's2' }];
    tables.homework_grades = [{ attempt_id: 'a1', released_at: new Date().toISOString() }, { attempt_id: 'a2', released_at: '2026-01-01T00:00:00.000Z' }];
    await send({ action: 'release_all' });
    expect(tables.notifications.map((row) => row.user_id)).toEqual(['s1']);
  });
});

describe('labels', () => {
  it('describes who an announcement went to', () => {
    expect(audienceLabel({ audience: 'students', gradeLevel: 'jhs 1', className: null }, (g) => g.toUpperCase())).toBe('Students in JHS 1');
    expect(audienceLabel({ audience: 'students', gradeLevel: null, className: 'A' })).toBe('Class A');
    expect(audienceLabel({ audience: 'everyone', gradeLevel: null, className: null })).toBe('Everyone');
  });

  it('says how long ago something happened', () => {
    const now = new Date('2026-11-09T12:00:00Z');
    expect(timeAgo('2026-11-09T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-09T11:15:00Z', now)).toBe('45 min ago');
    expect(timeAgo('2026-11-09T07:00:00Z', now)).toBe('5 h ago');
    expect(timeAgo('2026-11-06T12:00:00Z', now)).toBe('3 d ago');
  });
});
