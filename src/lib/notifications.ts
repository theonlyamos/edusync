/** Shapes shared by the notification bell, the announcements pages and their API routes. */

export const NOTIFICATION_KINDS = [
  'announcement',
  'homework_assigned',
  'homework_submitted',
  'homework_returned',
  'live_class_scheduled',
  'low_credits',
  'report_card',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationFeed = { notifications: AppNotification[]; unread: number };

export const ANNOUNCEMENT_AUDIENCES = ['everyone', 'teachers', 'students'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  gradeLevel: string | null;
  classId: string | null;
  className: string | null;
  authorName: string | null;
  recipientCount: number;
  createdAt: string;
};

export const ANNOUNCEMENT_TITLE_MAX = 150;
export const ANNOUNCEMENT_BODY_MAX = 4000;

/** "Everyone", "Teachers", "Students in JHS 1", "Class 1A". */
export function audienceLabel(
  a: Pick<Announcement, 'audience' | 'gradeLevel' | 'className'>,
  gradeLabel: (grade: string) => string = (grade) => grade,
): string {
  if (a.className) return `Class ${a.className}`;
  if (a.audience === 'students' && a.gradeLevel) return `Students in ${gradeLabel(a.gradeLevel)}`;
  return a.audience === 'everyone' ? 'Everyone' : a.audience === 'teachers' ? 'Teachers' : 'Students';
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
