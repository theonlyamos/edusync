import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX } from '@/lib/notifications';
import {
  AnnouncementError,
  listAnnouncements,
  postAnnouncement,
  schoolAnnouncementClasses,
  teacherAnnouncementClasses,
} from '@/lib/notifications.server';
import { isSchoolManager, requireSchoolRole } from '@/lib/school-access.server';

const READERS = ['owner', 'admin', 'teacher', 'student'] as const;
const WRITERS = ['owner', 'admin', 'teacher'] as const;
/** Posts one person may send in a day. Each post can reach a whole school. */
const DAILY_POSTS = 30;

/**
 * Announcements the caller may read, plus what they need to write one:
 * whether they can post, and the classes and grades they can post to.
 */
export async function GET() {
  try {
    const guard = await requireSchoolRole(READERS);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId } = guard.context;
    const viewer = { userId, schoolId: membership.school.id, schoolRole: membership.role };
    const manager = isSchoolManager(membership.role);
    const canPost = manager || membership.role === 'teacher';
    const [announcements, classes] = await Promise.all([
      listAnnouncements(supabase, viewer),
      !canPost
        ? Promise.resolve([])
        : manager
          ? schoolAnnouncementClasses(supabase, membership.school.id)
          : teacherAnnouncementClasses(supabase, membership.school.id, userId),
    ]);
    return NextResponse.json({
      announcements,
      canPost,
      manager,
      classes,
      grades: manager ? membership.school.grade_levels ?? [] : [],
    });
  } catch (error) {
    console.error('[GET /api/announcements]', error);
    return NextResponse.json({ error: 'Could not load announcements' }, { status: 500 });
  }
}

const postSchema = z.object({
  title: z.string().trim().min(1, 'Give the announcement a title').max(ANNOUNCEMENT_TITLE_MAX),
  body: z.string().trim().min(1, 'Write the announcement').max(ANNOUNCEMENT_BODY_MAX),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).default('students'),
  gradeLevel: z.string().trim().max(60).nullish(),
  classId: z.string().uuid().nullish(),
});

/** Posts an announcement and notifies everyone it is for. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSchoolRole(WRITERS);
    if (!guard.ok) return guard.response;
    const { supabase, membership, userId } = guard.context;
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the announcement' }, { status: 400 });
    }

    const { data: allowed, error: limitError } = await supabase.rpc('hit_rate_limit', {
      p_key: `announce:${userId}:${new Date().toISOString().slice(0, 10)}`,
      p_max: DAILY_POSTS,
      p_window_seconds: 2 * 24 * 60 * 60,
    });
    if (!limitError && allowed === false) {
      return NextResponse.json({ error: `You can post ${DAILY_POSTS} announcements a day. Try again tomorrow.` }, { status: 429 });
    }

    const result = await postAnnouncement(
      supabase,
      { userId, schoolId: membership.school.id, schoolRole: membership.role },
      {
        title: parsed.data.title,
        body: parsed.data.body,
        audience: parsed.data.audience,
        gradeLevel: parsed.data.gradeLevel || null,
        classId: parsed.data.classId || null,
      },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AnnouncementError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[POST /api/announcements]', error);
    return NextResponse.json({ error: 'Could not post the announcement' }, { status: 500 });
  }
}
