"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { validateMarks, type HomeworkDetail } from "@/lib/homework/domain";
import {
  questionInsights,
  scoreBands,
  SCORE_BANDS,
  plural,
  type MarkedSubmission,
} from "@/lib/homework/insights";
import {
  HomeworkHeader,
  HomeworkPanel,
  StatRow,
  DataState,
  useHomeworkData,
  Notice,
} from "./shared";
export function TeacherHomeworkInsights({ id }: { id: string }) {
  const { data, error, loading, refresh } = useHomeworkData<HomeworkDetail>(
    `/api/homework/${id}`,
  );
  if (!data)
    return (
      <DashboardLayout>
        <HomeworkHeader title="Homework performance" />
        <DataState loading={loading} error={error} retry={refresh} />
      </DashboardLayout>
    );
  const h = data.homework,
    latest = data.recipients.map((r) =>
      data.attempts.find((a) => a.student_id === r.student_id),
    ),
    grades = latest.flatMap((a) => {
      const g = data.grades.find((g) => g.attempt_id === a?.id);
      try {
        validateMarks(h.questions, g?.marks ?? {}, true);
        return g ? [g] : [];
      } catch {
        return [];
      }
    }),
    possible = h.questions.reduce((n, q) => n + q.points, 0),
    earned = grades.reduce(
      (n, g) => n + Object.values(g.marks).reduce((sum, m) => sum + m.score, 0),
      0,
    );
  const submissions: MarkedSubmission[] = grades.flatMap((g) => {
    const attempt = data.attempts.find((a) => a.id === g.attempt_id);
    if (!attempt) return [];
    return [
      {
        studentId: attempt.student_id,
        name:
          data.recipients.find((r) => r.student_id === attempt.student_id)
            ?.name ?? "Student",
        answers: attempt.answers,
        marks: g.marks,
      },
    ];
  });
  const bands = scoreBands(h.questions, submissions),
    perQuestion = questionInsights(h.questions, submissions);
  return (
    <DashboardLayout>
      <HomeworkHeader
        title="What needs another look?"
        description={`${h.title} · ${grades.length} completely marked submissions`}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/teachers/homework/${id}`}>Back to submissions</Link>
          </Button>
        }
      />
      <DataState loading={loading} error={error} retry={refresh} />
      <StatRow
        items={[
          {
            label: "Average score",
            value: grades.length
              ? Math.round((100 * earned) / (possible * grades.length)) + "%"
              : "—",
          },
          {
            label: "Submitted",
            value: `${latest.filter((a) => a?.submitted_at).length} / ${data.recipients.length}`,
          },
          {
            label: "Marked",
            value: grades.length,
            detail: "Private and released grades",
          },
        ]}
      />
      {!grades.length ? (
        <Notice>
          Mark submitted work to see question and objective evidence.
        </Notice>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          <HomeworkPanel>
            <h2 className="text-2xl mb-5">By learning objective</h2>
            {h.objectives.map((o) => {
              const qs = h.questions.filter((q) => q.objectiveId === o.id),
                max = qs.reduce((n, q) => n + q.points, 0) * grades.length,
                got = grades.reduce(
                  (n, g) =>
                    n + qs.reduce((sum, q) => sum + g.marks[q.id].score, 0),
                  0,
                ),
                p = max ? Math.round((100 * got) / max) : null;
              return (
                <div key={o.id} className="border-b py-4">
                  <div className="flex justify-between gap-3">
                    <strong className="text-sm">{o.text}</strong>
                    <span>{p === null ? "No questions" : p + "%"}</span>
                  </div>
                  {p !== null && (
                    <div
                      className="h-2 bg-muted rounded mt-3 overflow-hidden"
                      role="meter"
                      aria-label={o.text}
                      aria-valuenow={p}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full bg-primary"
                        style={{ width: p + "%" }}
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {plural(qs.length, "question")} ·{" "}
                    {plural(grades.length, "marked submission")}
                  </p>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground mt-4">
              An assignment snapshot, not a mastery judgment.
            </p>
          </HomeworkPanel>
          <HomeworkPanel>
            <h2 className="text-2xl mb-5">Score distribution</h2>
            {SCORE_BANDS.map((label, i) => (
              <div key={label} className="py-3">
                <div className="flex justify-between mb-2 text-sm">
                  <span>{label}</span>
                  <span>{plural(bands[i].length, "student")}</span>
                </div>
                <div className="h-3 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: (100 * bands[i].length) / grades.length + "%",
                    }}
                  />
                </div>
                {bands[i].length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground break-words">
                    {bands[i].map((s) => `${s.name} (${s.percent}%)`).join(", ")}
                  </p>
                )}
              </div>
            ))}
            <Notice>
              Use question feedback to plan follow-up. Participation and
              correctness measure different things.
            </Notice>
            <Button variant="outline" asChild>
              <Link href={`/teachers/homework/${id}/mark`}>
                Review student work
              </Link>
            </Button>
          </HomeworkPanel>
          <HomeworkPanel className="lg:col-span-2">
            <h2 className="text-2xl mb-1">By question</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Lowest scores first, so the questions to reteach are at the top.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Question</th>
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">Marks earned</th>
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">Full marks</th>
                    <th className="py-2 font-medium">Most common wrong answer</th>
                  </tr>
                </thead>
                <tbody>
                  {[...perQuestion]
                    .sort((a, b) => a.percent - b.percent || a.number - b.number)
                    .map((row) => (
                      <tr key={row.questionId} className="border-b align-top">
                        <td className="py-3 pr-3 min-w-48">
                          <span className="font-medium">Q{row.number}.</span>{" "}
                          <span className="break-words">{row.prompt}</span>
                        </td>
                        <td className={`py-3 pr-3 tabular-nums ${row.percent < 50 ? "text-destructive font-medium" : ""}`}>
                          {row.percent}%
                        </td>
                        <td className="py-3 pr-3 tabular-nums whitespace-nowrap">
                          {row.fullMarks} of {submissions.length}
                        </td>
                        <td className="py-3 break-words">
                          {row.commonWrongAnswer
                            ? `${row.commonWrongAnswer.answer} (${plural(row.commonWrongAnswer.count, "student")})`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </HomeworkPanel>
        </div>
      )}
    </DashboardLayout>
  );
}
