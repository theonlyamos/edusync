import 'server-only';
import { isEmailConfigured, sendEmails } from '@/lib/email';
import { LOW_BALANCE_CREDITS } from '@/lib/school-billing';
import type { ServiceSupabase } from '@/lib/school-access.server';
import { createServerSupabase } from '@/lib/supabase.server';
import type {
  Announcement,
  AnnouncementAudience,
  AppNotification,
  NotificationFeed,
  NotificationKind,
} from '@/lib/notifications';

export type NewNotification = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  /** A path inside the app, e.g. /students/homework/<id>. */
  href?: string | null;
  announcementId?: string | null;
};

const FEED_LIMIT = 30;
const INSERT_CHUNK = 500;
/** Supabase returns at most this many rows per request. */
const PAGE = 1000;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Adds notifications. Never throws: a notification is a courtesy on top of
 * the action that caused it, so a failure here must not fail that action.
 */
export async function notify(rows: NewNotification[], supabase: ServiceSupabase = createServerSupabase()): Promise<number> {
  const seen = new Set<string>();
  const unique = rows.filter((row) => {
    const key = `${row.userId}:${row.kind}:${row.href ?? ''}:${row.announcementId ?? ''}`;
    if (!row.userId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  let added = 0;
  try {
    for (let i = 0; i < unique.length; i += INSERT_CHUNK) {
      const part = unique.slice(i, i + INSERT_CHUNK).map((row) => ({
        user_id: row.userId,
        kind: row.kind,
        title: clip(row.title.trim() || 'Notification', 200),
        body: row.body ? clip(row.body, 4000) : null,
        href: row.href && row.href.startsWith('/') && !row.href.startsWith('//') ? row.href.slice(0, 300) : null,
        announcement_id: row.announcementId ?? null,
      }));
      const { error } = await supabase.from('notifications').insert(part);
      if (error) {
        console.error('[notifications] insert failed:', error.message);
        break;
      }
      added += part.length;
    }
  } catch (error) {
    console.error('[notifications] insert failed:', error);
  }
  return added;
}

type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export async function notificationFeed(supabase: ServiceSupabase, userId: string): Promise<NotificationFeed> {
  const [list, unread] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, kind, title, body, href, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null),
  ]);
  if (list.error) throw list.error;
  if (unread.error) throw unread.error;
  return {
    notifications: ((list.data ?? []) as NotificationRow[]).map(
      (row): AppNotification => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        href: row.href,
        readAt: row.read_at,
        createdAt: row.created_at,
      }),
    ),
    unread: unread.count ?? 0,
  };
}

/** Marks the person's own notifications read: the given ones, or all of them. */
export async function markNotificationsRead(supabase: ServiceSupabase, userId: string, ids: string[] | 'all') {
  let query = supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
  if (ids !== 'all') {
    if (ids.length === 0) return;
    query = query.in('id', ids.slice(0, 200));
  }
  const { error } = await query;
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export class AnnouncementError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type AnnouncementInput = {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  gradeLevel: string | null;
  classId: string | null;
};

type Author = { userId: string; schoolId: string; schoolRole: string };

const isManager = (role: string) => role === 'owner' || role === 'admin';

/** Active members of the school with one of the roles, as user id -> role. Reads every page. */
async function activeMembers(supabase: ServiceSupabase, schoolId: string, roles: string[]): Promise<Map<string, string>> {
  const members = new Map<string, string>();
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id, role')
      .eq('organization_id', schoolId)
      .eq('is_active', true)
      .in('role', roles)
      .order('user_id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) members.set(row.user_id as string, row.role as string);
    if ((data ?? []).length < PAGE) break;
  }
  return members;
}

/** The people an announcement goes to (user id -> school role), never including its author. */
async function resolveRecipients(supabase: ServiceSupabase, author: Author, input: AnnouncementInput): Promise<Map<string, string>> {
  let people: Map<string, string>;
  if (input.classId) {
    const { data: found, error: classError } = await supabase
      .from('school_classes')
      .select('id')
      .eq('id', input.classId)
      .eq('organization_id', author.schoolId)
      .maybeSingle();
    if (classError) throw classError;
    if (!found) throw new AnnouncementError('Pick a class at your school', 400);
    if (!isManager(author.schoolRole)) {
      const { data: teaches, error } = await supabase
        .from('school_class_teachers')
        .select('class_id')
        .eq('class_id', input.classId)
        .eq('teacher_id', author.userId)
        .maybeSingle();
      if (error) throw error;
      if (!teaches) throw new AnnouncementError('You can only post to classes you teach', 403);
    }
    const { data, error } = await supabase.from('school_class_students').select('student_id').eq('class_id', input.classId).limit(PAGE);
    if (error) throw error;
    const inClass = new Set((data ?? []).map((row) => row.student_id as string));
    const students = await activeMembers(supabase, author.schoolId, ['student']);
    people = new Map([...students].filter(([id]) => inClass.has(id)));
  } else {
    if (!isManager(author.schoolRole)) throw new AnnouncementError('Pick one of your classes', 400);
    const roles = input.audience === 'everyone' ? ['owner', 'admin', 'teacher', 'student'] : input.audience === 'teachers' ? ['teacher'] : ['student'];
    people = await activeMembers(supabase, author.schoolId, roles);
    if (input.audience === 'students' && input.gradeLevel) {
      const grade = input.gradeLevel.trim().toLowerCase();
      const inGrade = new Set<string>();
      for (let from = 0; from < 50_000; from += PAGE) {
        const { data, error } = await supabase.from('students').select('user_id, grade').ilike('grade', grade.replace(/[\\%_]/g, (c) => `\\${c}`)).order('user_id').range(from, from + PAGE - 1);
        if (error) throw error;
        for (const row of data ?? []) inGrade.add(row.user_id as string);
        if ((data ?? []).length < PAGE) break;
      }
      people = new Map([...people].filter(([id]) => inGrade.has(id)));
    }
  }
  people.delete(author.userId);
  return people;
}

export async function announcementRecipients(supabase: ServiceSupabase, author: Author, input: AnnouncementInput): Promise<string[]> {
  return [...(await resolveRecipients(supabase, author, input)).keys()];
}

const announcementHref = (role: 'school' | 'teacher' | 'student') =>
  role === 'school' ? '/school/announcements' : role === 'teacher' ? '/teachers/announcements' : '/students/announcements';

export async function postAnnouncement(supabase: ServiceSupabase, author: Author, input: AnnouncementInput): Promise<{ id: string; recipients: number }> {
  const people = await resolveRecipients(supabase, author, input);
  const recipients = [...people.keys()];
  if (recipients.length === 0) throw new AnnouncementError('Nobody matches that audience yet', 400);

  const { data, error } = await supabase
    .from('announcements')
    .insert({
      organization_id: author.schoolId,
      author_id: author.userId,
      audience: input.classId ? 'students' : input.audience,
      grade_level: input.classId ? null : input.audience === 'students' ? input.gradeLevel?.trim().toLowerCase() || null : null,
      class_id: input.classId,
      title: input.title,
      body: input.body,
      recipient_count: recipients.length,
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Announcement was not saved');

  // Each person's link opens the announcements page of their own portal.
  await notify(
    recipients.map((userId) => {
      const role = people.get(userId);
      return {
        userId,
        kind: 'announcement' as const,
        title: input.title,
        body: clip(input.body, 300),
        href: announcementHref(role === 'teacher' ? 'teacher' : role === 'student' ? 'student' : 'school'),
        announcementId: data.id as string,
      };
    }),
    supabase,
  );
  return { id: data.id as string, recipients: recipients.length };
}

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  grade_level: string | null;
  class_id: string | null;
  author_id: string | null;
  recipient_count: number;
  created_at: string;
};

async function decorate(supabase: ServiceSupabase, rows: AnnouncementRow[]): Promise<Announcement[]> {
  const authorIds = [...new Set(rows.map((row) => row.author_id).filter((id): id is string => Boolean(id)))];
  const classIds = [...new Set(rows.map((row) => row.class_id).filter((id): id is string => Boolean(id)))];
  const [authors, classes] = await Promise.all([
    authorIds.length ? supabase.from('users').select('id, name').in('id', authorIds) : Promise.resolve({ data: [], error: null }),
    classIds.length ? supabase.from('school_classes').select('id, name').in('id', classIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (authors.error) throw authors.error;
  if (classes.error) throw classes.error;
  const authorName = new Map((authors.data ?? []).map((row) => [row.id as string, (row.name as string | null) ?? null]));
  const className = new Map((classes.data ?? []).map((row) => [row.id as string, row.name as string]));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    gradeLevel: row.grade_level,
    classId: row.class_id,
    className: row.class_id ? className.get(row.class_id) ?? null : null,
    authorName: row.author_id ? authorName.get(row.author_id) ?? null : null,
    recipientCount: row.recipient_count,
    createdAt: row.created_at,
  }));
}

const ANNOUNCEMENT_FIELDS = 'id, title, body, audience, grade_level, class_id, author_id, recipient_count, created_at';

/**
 * Announcements the person may read. School managers see everything their
 * school sent; everyone else sees what was sent to them, plus what they wrote.
 */
export async function listAnnouncements(supabase: ServiceSupabase, viewer: Author): Promise<Announcement[]> {
  if (isManager(viewer.schoolRole)) {
    const { data, error } = await supabase
      .from('announcements')
      .select(ANNOUNCEMENT_FIELDS)
      .eq('organization_id', viewer.schoolId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return decorate(supabase, (data ?? []) as AnnouncementRow[]);
  }
  const [received, written] = await Promise.all([
    supabase
      .from('notifications')
      .select('announcement_id')
      .eq('user_id', viewer.userId)
      .eq('kind', 'announcement')
      .not('announcement_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('announcements').select('id').eq('organization_id', viewer.schoolId).eq('author_id', viewer.userId).order('created_at', { ascending: false }).limit(100),
  ]);
  if (received.error) throw received.error;
  if (written.error) throw written.error;
  const ids = [...new Set([...(received.data ?? []).map((row) => row.announcement_id as string), ...(written.data ?? []).map((row) => row.id as string)])];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('announcements')
    .select(ANNOUNCEMENT_FIELDS)
    .eq('organization_id', viewer.schoolId)
    .in('id', ids)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return decorate(supabase, (data ?? []) as AnnouncementRow[]);
}

/** Classes a teacher may post to (the ones they are assigned to). */
export async function teacherAnnouncementClasses(supabase: ServiceSupabase, schoolId: string, teacherId: string): Promise<{ id: string; name: string; grade: string }[]> {
  const { data: links, error } = await supabase.from('school_class_teachers').select('class_id').eq('organization_id', schoolId).eq('teacher_id', teacherId).limit(500);
  if (error) throw error;
  const ids = (links ?? []).map((row) => row.class_id as string);
  if (ids.length === 0) return [];
  const { data, error: classError } = await supabase.from('school_classes').select('id, name, grade').eq('organization_id', schoolId).in('id', ids).order('name');
  if (classError) throw classError;
  return (data ?? []).map((row) => ({ id: row.id as string, name: row.name as string, grade: row.grade as string }));
}

/** Every class at the school, for owners and administrators. */
export async function schoolAnnouncementClasses(supabase: ServiceSupabase, schoolId: string): Promise<{ id: string; name: string; grade: string }[]> {
  const { data, error } = await supabase.from('school_classes').select('id, name, grade').eq('organization_id', schoolId).order('grade').order('name').limit(1000);
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id as string, name: row.name as string, grade: row.grade as string }));
}

// ---------------------------------------------------------------------------
// Low school credits
// ---------------------------------------------------------------------------

/**
 * Tells a school's owner and administrators, once a day at most, that the
 * credit pool is running low: in the app, and by email when email is set up.
 * Never throws.
 */
export async function warnLowSchoolCredits(schoolId: string, remainingCredits: number, now: Date = new Date()): Promise<void> {
  if (remainingCredits > LOW_BALANCE_CREDITS) return;
  try {
    const supabase = createServerSupabase();
    const { data: first, error: limitError } = await supabase.rpc('hit_rate_limit', {
      p_key: `low-credits:${schoolId}:${now.toISOString().slice(0, 10)}`,
      p_max: 1,
      p_window_seconds: 2 * 24 * 60 * 60,
    });
    if (limitError || first !== true) return;

    const managers = [...(await activeMembers(supabase, schoolId, ['owner', 'admin'])).keys()];
    if (managers.length === 0) return;
    const title = remainingCredits <= 0 ? 'Your school is out of credits' : `Your school has ${remainingCredits} credits left`;
    const body = 'Voice tutoring and live classes stop when credits run out. Top up from the Billing page.';
    await notify(managers.map((userId) => ({ userId, kind: 'low_credits' as const, title, body, href: '/school/billing' })), supabase);

    if (!isEmailConfigured()) return;
    const { data: people, error } = await supabase.from('users').select('email').in('id', managers);
    if (error) return;
    const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const link = `${base}/school/billing`;
    await sendEmails(
      (people ?? [])
        .map((person) => person.email as string | null)
        .filter((email): email is string => Boolean(email))
        .map((to) => ({
          to,
          subject: `InsyteAI: ${title}`,
          text: `${title}.\n\n${body}\n\n${link}`,
          html: `<p><strong>${title}.</strong></p><p>${body}</p><p><a href="${link}">Open Billing</a></p>`,
        })),
    );
  } catch (error) {
    console.error('[notifications] low credit warning failed:', error);
  }
}

/** The same warning, for the school that pays for this person's voice tutoring. */
export async function warnLowCreditsForMember(userId: string, remainingCredits: number): Promise<void> {
  if (remainingCredits > LOW_BALANCE_CREDITS) return;
  try {
    const { data } = await createServerSupabase().rpc('user_school_id', { p_user_id: userId });
    if (typeof data === 'string' && data) await warnLowSchoolCredits(data, remainingCredits);
  } catch (error) {
    console.error('[notifications] low credit warning failed:', error);
  }
}

/** The same warning, for the school whose live class this session belongs to. */
export async function warnLowCreditsForLiveSession(sessionId: string, remainingCredits: number): Promise<void> {
  if (remainingCredits > LOW_BALANCE_CREDITS) return;
  try {
    const supabase = createServerSupabase();
    const { data: session } = await supabase.from('learning_sessions').select('live_class_event_id').eq('id', sessionId).maybeSingle();
    if (!session?.live_class_event_id) return;
    const { data: event } = await supabase.from('live_class_events').select('organization_id').eq('id', session.live_class_event_id).maybeSingle();
    if (event?.organization_id) await warnLowSchoolCredits(event.organization_id as string, remainingCredits);
  } catch (error) {
    console.error('[notifications] low credit warning failed:', error);
  }
}
