import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHomeworkUser, homeworkError } from "@/lib/homework/server";
import { saveHomework } from "@/lib/homework/operations";
import { requestBody } from "@/lib/homework/server";
import { readAll } from "@/lib/homework/read-all";
export async function POST(request: Request) {
  try {
    return NextResponse.json(await saveHomework(await requestBody(request)), {
      status: 201,
    });
  } catch (error) {
    return homeworkError(error);
  }
}
export async function GET(request: Request) {
  try {
    const { db, user } = await requireHomeworkUser(),
      url = new URL(request.url),
      page = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .parse(url.searchParams.get("page") ?? 0);
    let query = db
      .from("homeworks")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id");
    if (url.searchParams.has("lessonId"))
      query = query.eq(
        "lesson_id",
        z.string().uuid().parse(url.searchParams.get("lessonId")),
      );
    if (user.role === "student") {
      query = db
        .from("homeworks")
        .select("*,homework_recipients!inner(student_id)")
        .eq("homework_recipients.student_id", user.id)
        .neq("status", "draft")
        .order("created_at", { ascending: false })
        .order("id");
      if (url.searchParams.has("lessonId"))
        query = query.eq(
          "lesson_id",
          z.string().uuid().parse(url.searchParams.get("lessonId")),
        );
    } else query = query.eq("owner_id", user.id);
    const { data: rows, error } = await query.range(page * 50, page * 50 + 50);
    if (error) throw error;
    const organizations = [
      ...new Set((rows ?? []).map((h) => h.organization_id).filter(Boolean)),
    ];
    const membershipResult = organizations.length
      ? await db
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .in("organization_id", organizations)
      : { data: [], error: null };
    if (membershipResult.error) throw membershipResult.error;
    const memberships = new Set(
      membershipResult.data?.map((m) => m.organization_id),
    );
    const homeworks = (rows ?? [])
      .slice(0, 50)
      .filter(
        (h) =>
          h.status === "draft" ||
          (user.role !== "student" &&
            h.status === "archived" &&
            !h.published_at) ||
          memberships.has(h.organization_id),
      );
    const ids = homeworks.map((h) => h.id);
    if (!ids.length)
      return NextResponse.json({
        items: [],
        hasMore: (rows?.length ?? 0) > 50,
      });
    let attemptsQuery = db
      .from("homework_attempts")
      .select(
        "id,homework_id,student_id,attempt_number,submitted_at,late,revision_feedback,revision_due_at,version",
      )
      .in("homework_id", ids)
      .order("attempt_number", { ascending: false })
      .order("id");
    if (user.role === "student")
      attemptsQuery = attemptsQuery.eq("student_id", user.id);
    const attempts = await readAll((from, to) => attemptsQuery.range(from, to));
    let gradeQuery = db
      .from("homework_grades")
      .select(
        "attempt_id,marks,released_marks,released_at,homework_attempts!inner(homework_id,student_id)",
      )
      .in("homework_attempts.homework_id", ids)
      .order("attempt_id");
    if (user.role === "student")
      gradeQuery = gradeQuery.eq("homework_attempts.student_id", user.id);
    const grades = await readAll((from, to) => gradeQuery.range(from, to));
    let recipientsQuery = db
      .from("homework_recipients")
      .select("homework_id,student_id,extension_at")
      .in("homework_id", ids);
    if (user.role === "student")
      recipientsQuery = recipientsQuery.eq("student_id", user.id);
    const recipients = await readAll((from, to) =>
      recipientsQuery.order("student_id").order("homework_id").range(from, to),
    );
    const items = homeworks.map((homework) => {
      const all = (attempts ?? []).filter((a) => a.homework_id === homework.id),
        latest = new Map<string, (typeof all)[number]>();
      for (const a of all)
        if (!latest.has(a.student_id)) latest.set(a.student_id, a);
      const current = [...latest.values()],
        myAttempt = current.find((a) => a.student_id === user.id),
        grade = grades?.find((g) => g.attempt_id === myAttempt?.id);
      return {
        homework,
        assigned: (recipients ?? []).filter(
          (r) => r.homework_id === homework.id,
        ).length,
        submitted: current.filter((a) => a.submitted_at).length,
        marked:
          user.role === "student"
            ? undefined
            : current.filter((a) => {
                const g = grades?.find((g) => g.attempt_id === a.id);
                return (
                  g &&
                  homework.questions.every((q: { id: string }) => g.marks[q.id])
                );
              }).length,
        released: current.filter(
          (a) => grades?.find((g) => g.attempt_id === a.id)?.released_at,
        ).length,
        myAttempt,
        extensionAt: recipients?.find(
          (r) => r.homework_id === homework.id && r.student_id === user.id,
        )?.extension_at,
        score:
          user.role === "student" && grade?.released_at
            ? Object.values(grade.released_marks ?? {}).reduce(
                (n: number, m) => n + Number((m as { score: number }).score),
                0,
              )
            : null,
        releasedAt: grade?.released_at ?? null,
      };
    });
    return NextResponse.json({ items, hasMore: (rows?.length ?? 0) > 50 });
  } catch (error) {
    return homeworkError(error);
  }
}
