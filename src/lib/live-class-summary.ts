// What happened in a finished live class, for the teacher who ran it.

export interface LiveClassSummary {
  event: {
    id: string;
    title: string;
    gradeLevel: string | null;
    lessonTitle: string | null;
    scheduledStart: string;
    scheduledEnd: string;
    status: string;
  };
  /** Students only; the host is left out. */
  attendance: { joined: number; invited: number };
  students: { id: string; name: string; joinedAt: string | null }[];
  session: {
    topic: string | null;
    startedAt: string | null;
    endedAt: string | null;
    /** Live AI minutes paid for (1 credit each). */
    minutesCharged: number;
  } | null;
  /** The first visuals, in order; may be fewer than visualCount. */
  visuals: { id: string; description: string; createdAt: string }[];
  visualCount: number;
}

interface Enrollment { user_id: string; role: string | null; joined_at: string | null }

export function buildAttendance(
  enrollments: Enrollment[],
  names: Map<string, string>,
  organizerId: string,
): Pick<LiveClassSummary, 'attendance' | 'students'> {
  const students = enrollments
    .filter((e) => e.user_id !== organizerId && (e.role ?? 'student') !== 'host')
    .map((e) => ({ id: e.user_id, name: names.get(e.user_id) ?? 'Student', joinedAt: e.joined_at }))
    // Joined first (earliest first), then everyone who didn't, by name.
    .sort((a, b) =>
      a.joinedAt && b.joinedAt
        ? a.joinedAt.localeCompare(b.joinedAt)
        : a.joinedAt
          ? -1
          : b.joinedAt
            ? 1
            : a.name.localeCompare(b.name),
    );
  return {
    students,
    attendance: { joined: students.filter((s) => s.joinedAt).length, invited: students.length },
  };
}

/** A short line for a visual: its description, else the first line of its explanation. */
export function visualLabel(description: string | null, explanation: string | null): string {
  const text = (description || explanation || '').trim().split('\n')[0] ?? '';
  if (!text) return 'Visual';
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}
