import { NextResponse } from "next/server";
import { readAll } from "@/lib/homework/read-all";
import {
  requireHomeworkUser,
  homeworkError,
  HomeworkError,
} from "@/lib/homework/server";
import {
  aggregatePerformance,
  type Homework,
  type Attempt,
  type Marks,
} from "@/lib/homework/domain";
export async function GET() {
  try {
    const { db, user } = await requireHomeworkUser();
    if (user.role !== "student")
      throw new HomeworkError(403, "Student access required");
    const { data: members, error: memberError } = await db
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("is_active", true);
    if (memberError) throw memberError;
    if (!members?.length)
      return NextResponse.json({ ...aggregatePerformance([]), objectives: [] });
    const attempts = await readAll(
      (from, to) =>
        db
          .from("homework_attempts")
          .select("*,homeworks!inner(*)")
          .eq("student_id", user.id)
          .not("submitted_at", "is", null)
          .in(
            "homeworks.organization_id",
            members.map((m) => m.organization_id),
          )
          .order("id")
          .range(from, to),
      5000,
    );
    // shortcut: cap one performance request at 5000 attempts; add server pagination before larger histories.
    const entries: {
      homeworkId: string;
      attempt: number;
      releasedAt: string;
      earned: number;
      possible: number;
      late: boolean;
      title: string;
      subject: string;
      marks: Marks;
      homework: Homework;
    }[] = [];
    for (let offset = 0; offset < (attempts?.length ?? 0); offset += 150) {
      const batch = attempts!.slice(offset, offset + 150);
      const { data: grades, error: gradeError } = await db
        .from("homework_grades")
        .select("attempt_id,released_marks,released_at")
        .in(
          "attempt_id",
          batch.map((a) => a.id),
        )
        .not("released_at", "is", null);
      if (gradeError) throw gradeError;
      for (const row of batch) {
        const a = row as unknown as Attempt & { homeworks: Homework },
          g = grades?.find((g) => g.attempt_id === a.id);
        if (!g?.released_marks) continue;
        const marks = g.released_marks as Marks,
          h = a.homeworks;
        entries.push({
          homeworkId: h.id,
          attempt: a.attempt_number,
          releasedAt: g.released_at,
          earned: Object.values(marks).reduce((n, m) => n + m.score, 0),
          possible: h.questions.reduce((n, q) => n + q.points, 0),
          late: a.late,
          title: h.title,
          subject: h.subject,
          marks,
          homework: h,
        });
      }
    }
    const result = aggregatePerformance(entries),
      objectives = new Map<
        string,
        {
          id: string;
          text: string;
          earned: number;
          possible: number;
          count: number;
        }
      >();
    for (const item of result.items)
      for (const objective of item.homework.objectives) {
        const questions = item.homework.questions.filter(
          (q) => q.objectiveId === objective.id,
        );
        if (!questions.length) continue;
        const key = `${item.homework.lesson_id}:${objective.id}:${objective.revision}`;
        const current = objectives.get(key) ?? {
          id: key,
          text: objective.text,
          earned: 0,
          possible: 0,
          count: 0,
        };
        current.earned += questions.reduce(
          (n, q) => n + (item.marks[q.id]?.score ?? 0),
          0,
        );
        current.possible += questions.reduce((n, q) => n + q.points, 0);
        current.count++;
        objectives.set(key, current);
      }
    return NextResponse.json({
      ...result,
      items: result.items.map(({ homework: _, marks: __, ...item }) => item),
      objectives: [...objectives.values()],
    });
  } catch (error) {
    return homeworkError(error);
  }
}
