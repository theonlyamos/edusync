"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { validateMarks, type HomeworkDetail } from "@/lib/homework/domain";
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
  const distribution = [0, 0, 0, 0];
  grades.forEach((g) => {
    const p =
      (100 * Object.values(g.marks).reduce((n, m) => n + m.score, 0)) /
      possible;
    distribution[p < 50 ? 0 : p < 70 ? 1 : p < 90 ? 2 : 3]++;
  });
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
                    {qs.length} questions · {grades.length} marked submissions
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
            {["Below 50%", "50–69%", "70–89%", "90–100%"].map((label, i) => (
              <div key={label} className="py-3">
                <div className="flex justify-between mb-2 text-sm">
                  <span>{label}</span>
                  <span>{distribution[i]} students</span>
                </div>
                <div className="h-3 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: (100 * distribution[i]) / grades.length + "%",
                    }}
                  />
                </div>
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
        </div>
      )}
    </DashboardLayout>
  );
}
