"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  gradeNeedsRelease,
  validateMarks,
  type HomeworkDetail,
} from "@/lib/homework/domain";
import {
  HomeworkHeader,
  HomeworkPanel,
  StatRow,
  DataState,
  Notice,
  Confirm,
  Field,
  fieldClass,
  formatHomeworkDate,
  useHomeworkData,
  useHomeworkClock,
  command,
  homeworkRequest,
  utcInput,
  utcValue,
} from "./shared";
export function TeacherHomeworkDetail({ id }: { id: string }) {
  const now = useHomeworkClock();
  const { data, error, loading, refresh } = useHomeworkData<HomeworkDetail>(
      `/api/homework/${id}`,
    ),
    [filter, setFilter] = useState("All students"),
    [modal, setModal] = useState(""),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    [studentId, setStudentId] = useState(""),
    [extension, setExtension] = useState(() =>
      new Date(Date.now() + 5 * 86400000).toISOString(),
    ),
    [reason, setReason] = useState(""),
    router = useRouter();
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setActionError("");
    try {
      await action();
      setModal("");
      await refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <DashboardLayout>
        <HomeworkHeader title="Homework" />
        <DataState loading={loading} error={error} retry={refresh} />
      </DashboardLayout>
    );
  const h = data.homework,
    latest = new Map(
      data.recipients.map((r) => [
        r.student_id,
        data.attempts.find((a) => a.student_id === r.student_id),
      ]),
    );
  const complete = (attemptId?: string) => {
    const g = data.grades.find((g) => g.attempt_id === attemptId);
    try {
      validateMarks(h.questions, g?.marks ?? {}, true);
      return true;
    } catch {
      return false;
    }
  };
  const submitted = [...latest.values()].filter((a) => a?.submitted_at),
    marked = submitted.filter((a) => {
      const grade = data.grades.find((g) => g.attempt_id === a?.id);
      return grade && complete(a?.id) && gradeNeedsRelease(grade);
    }),
    released = submitted.filter(
      (a) => data.grades.find((g) => g.attempt_id === a?.id)?.released_at,
    );
  const rows = data.recipients.filter(
    (r) =>
      filter === "All students" ||
      (filter === "Needs marking" &&
        latest.get(r.student_id)?.submitted_at &&
        !complete(latest.get(r.student_id)?.id)) ||
      (filter === "Not submitted" && !latest.get(r.student_id)?.submitted_at),
  );
  return (
    <DashboardLayout>
      <HomeworkHeader
        title={h.title}
        description={`${h.subject} · ${h.grade_level} · Due ${formatHomeworkDate(h.due_at, h.timezone)}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/teachers/homework">All homework</Link>
            </Button>
            <Button variant="outline" onClick={() => setModal("duplicate")}>
              Duplicate
            </Button>
            <Button variant="outline" onClick={() => setModal("archive")}>
              Archive
            </Button>
          </>
        }
      />
      <DataState loading={loading} error={error} retry={refresh} />
      {actionError && <Notice error>{actionError}</Notice>}
      {h.status === "draft" ? (
        <HomeworkPanel>
          <h2 className="text-2xl mb-3">This is a private draft.</h2>
          <Button asChild>
            <Link href={`/teachers/homework/${id}/edit`}>Continue editing</Link>
          </Button>
        </HomeworkPanel>
      ) : (
        <>
          <StatRow
            items={[
              {
                label: "Submitted",
                value: `${submitted.length} / ${data.recipients.length}`,
              },
              { label: "Ready for release", value: marked.length },
              { label: "Feedback released", value: released.length },
            ]}
          />
          <div className="flex flex-wrap gap-3 mb-6">
            <Button asChild>
              <Link href={`/teachers/homework/${id}/mark`}>Start marking</Link>
            </Button>
            <Button
              variant="outline"
              disabled={!marked.length}
              onClick={() => setModal("release_all")}
            >
              Release completed grades
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/teachers/homework/${id}/insights`}>
                View performance
              </Link>
            </Button>
            <Badge variant="secondary">
              {h.status === "archived"
                ? "Archived"
                : h.close_at && now > Date.parse(h.close_at)
                  ? "Closing date passed"
                  : "Published"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {["All students", "Needs marking", "Not submitted"].map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "ghost"}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>
          <div className="divide-y">
            {rows.map((r) => {
              const a = latest.get(r.student_id),
                g = data.grades.find((g) => g.attempt_id === a?.id);
              return (
                <div
                  key={r.student_id}
                  className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 py-4 items-center"
                >
                  <div>
                    <strong>{r.name}</strong>
                    <p className="text-xs text-muted-foreground">
                      {r.extension_at
                        ? "Extended to " +
                          formatHomeworkDate(r.extension_at, h.timezone)
                        : h.grade_level}
                    </p>
                  </div>
                  <div>
                    <Badge variant="outline">
                      {a?.submitted_at
                        ? g?.released_at && !gradeNeedsRelease(g)
                          ? "Feedback released"
                          : complete(a.id)
                            ? "Marked · private"
                            : "Needs marking"
                        : a?.revision_feedback
                          ? "Revision requested"
                          : a
                            ? "In progress"
                            : "Not started"}
                    </Badge>
                    {a?.submitted_at && (
                      <p className="text-xs mt-2 text-muted-foreground">
                        Attempt {a.attempt_number} ·{" "}
                        {a.late ? "Late" : "On time"} ·{" "}
                        {formatHomeworkDate(a.submitted_at, h.timezone)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        href={`/teachers/homework/${id}/mark?studentId=${r.student_id}`}
                      >
                        Review work
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={h.status === "archived"}
                      onClick={() => {
                        setStudentId(r.student_id);
                        setModal("extend");
                      }}
                    >
                      Extend
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {!rows.length && (
            <p className="text-muted-foreground py-8">
              No students match this filter.
            </p>
          )}
          <Notice>
            Published questions use lesson version {h.publication_version}.
            Grading drafts stay private until you release feedback.
          </Notice>
        </>
      )}
      <Confirm
        open={Boolean(modal)}
        onOpenChange={(v) => {
          if (!v) {
            setModal("");
            setActionError("");
          }
        }}
        title={
          modal === "extend"
            ? "Extend a student’s deadline"
            : modal === "release_all"
              ? "Release completed feedback?"
              : modal === "duplicate"
                ? "Create a new draft?"
                : "Archive this homework?"
        }
        description={
          modal === "extend"
            ? "Other students keep their existing deadline."
            : modal === "release_all"
              ? "New or changed complete grades for each student’s latest attempt are released. Older attempts and unmarked work stay as they are."
              : modal === "duplicate"
                ? "Copied questions and keys remain editable until the new homework is published."
                : "Existing submissions and released feedback remain accessible. New work will stop."
        }
        busy={busy}
        label={
          modal === "extend"
            ? "Save extension"
            : modal === "release_all"
              ? "Release feedback"
              : modal === "duplicate"
                ? "Duplicate as draft"
                : "Archive homework"
        }
        onConfirm={() =>
          run(async () => {
            if (modal === "duplicate") {
              const draft = {
                title: h.title + " (copy)",
                instructions: h.instructions,
                lessonId: h.lesson_id,
                publicationId: h.publication_id,
                objectiveIds: h.objectives.map((o) => o.id),
                questions: h.questions.map((q) => ({
                  ...q,
                  ...data.keys![q.id],
                })),
                dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
                closeAt: null,
                timezone: h.timezone,
                acceptLate: h.accept_late,
                allowHints: h.allow_hints,
                allowReferences: h.allow_references,
                minutes: h.minutes,
              };
              const created = await homeworkRequest<{ id: string }>(
                "/api/homework",
                { method: "POST", body: JSON.stringify(draft) },
              );
              router.push(`/teachers/homework/${created.id}/edit`);
            } else
              await command(
                id,
                modal === "extend"
                  ? { action: "extend", studentId, dueAt: extension, reason }
                  : { action: modal },
              );
          })
        }
      >
        {actionError && <Notice error>{actionError}</Notice>}
        {modal === "extend" && (
          <>
            <p className="font-medium">
              {data.recipients.find((r) => r.student_id === studentId)?.name}
            </p>
            <Field label="New deadline · UTC">
              <input
                type="datetime-local"
                className={fieldClass}
                value={utcInput(extension)}
                onChange={(e) => {
                  if (e.target.value) setExtension(utcValue(e.target.value));
                }}
              />
            </Field>
            <Field label="Reason">
              <textarea
                className={`${fieldClass} h-auto min-h-20`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
              />
            </Field>
          </>
        )}
      </Confirm>
    </DashboardLayout>
  );
}
