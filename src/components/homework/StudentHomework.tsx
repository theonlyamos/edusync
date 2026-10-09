"use client";
import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  validateAnswers,
  attemptIsEditable,
  type HomeworkDetail,
  type Attempt,
  type Attachment,
} from "@/lib/homework/domain";
import {
  HomeworkHeader,
  HomeworkPanel,
  Notice,
  DataState,
  QuestionResponse,
  StatRow,
  Confirm,
  useHomeworkData,
  useHomeworkClock,
  command,
  homeworkRequest,
  formatHomeworkDate,
  homeworkDue,
} from "./shared";
import { useHomeworkDraft } from "./useHomeworkDraft";

export function StudentHomework({ id }: { id: string }) {
  const now = useHomeworkClock();
  const api = useHomeworkData<HomeworkDetail>(`/api/homework/${id}`),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!api.data)
    return (
      <DashboardLayout>
        <HomeworkHeader title="Your homework" />
        <DataState
          loading={api.loading}
          error={api.error}
          retry={api.refresh}
        />
      </DashboardLayout>
    );
  const data = api.data,
    h = data.homework,
    a = data.attempts[0];
  return (
    <DashboardLayout>
      <HomeworkHeader
        title={h.title}
        description={`${h.subject} · ${h.lesson_title} · Set by ${data.teacherName}`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/students/homework">All homework</Link>
          </Button>
        }
      />
      {error && <Notice error>{error}</Notice>}
      {api.error && <Notice error>{api.error}</Notice>}
      {!a ? (
        <HomeworkPanel>
          <HomeworkBrief data={data} />
          <Button
            disabled={busy || h.status !== "published"}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await command(id, { action: "start" });
                await api.refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Opening…" : "Start homework"}
          </Button>
        </HomeworkPanel>
      ) : a.submitted_at ? (
        <StudentSubmitted data={data} />
      ) : (
        <StudentWork
          key={a.id}
          data={data}
          initial={a}
          refresh={api.refresh}
          now={now}
        />
      )}
    </DashboardLayout>
  );
}
function HomeworkBrief({ data }: { data: HomeworkDetail }) {
  const h = data.homework,
    a = data.attempts[0],
    due = homeworkDue(h, a, data.recipients[0]?.extension_at);
  return (
    <>
      <StatRow
        items={[
          {
            label: "Due",
            value: new Intl.DateTimeFormat("en-GB", {
              day: "numeric",
              month: "short",
              timeZone: h.timezone,
            }).format(new Date(due)),
            detail: formatHomeworkDate(due, h.timezone),
          },
          {
            label: "Questions",
            value: h.questions.length,
            detail: `About ${h.minutes} minutes`,
          },
          {
            label: "Available marks",
            value: h.questions.reduce((n, q) => n + q.points, 0),
          },
        ]}
      />
      <p className="whitespace-pre-wrap mb-6">
        {h.instructions ||
          "Work through the questions, then review your answers before submitting."}
      </p>
      <h2 className="text-xl mb-3">What you’ll practise</h2>
      <ul className="list-disc pl-5 space-y-2 mb-6">
        {h.objectives.map((o) => (
          <li key={o.id}>{o.text}</li>
        ))}
      </ul>
      <div className="flex gap-2 flex-wrap mb-5">
        <Badge variant="secondary">
          {h.allow_hints ? "Concept hints available" : "Hints disabled"}
        </Badge>
        <Badge variant="outline">
          {h.allow_references
            ? "Lesson reference available"
            : "Independent work"}
        </Badge>
        <Badge variant="outline">
          {h.accept_late ? "Late work accepted" : "Submit before your deadline"}
        </Badge>
      </div>
      {h.close_at && (
        <p className="text-sm mb-5">
          Closes {formatHomeworkDate(h.close_at, h.timezone)}. Individual
          extensions apply.
        </p>
      )}
      <p className="text-sm text-muted-foreground mb-5">
        Questions use lesson version {h.publication_version}. Your teacher
        approves marks before you see them.
      </p>
    </>
  );
}
function StudentWork({
  data,
  initial,
  refresh,
  now,
}: {
  data: HomeworkDetail;
  initial: Attempt;
  refresh: () => Promise<void>;
  now: number;
}) {
  const h = data.homework,
    draft = useHomeworkDraft(h.id, initial, h.questions, data.attachments);
  const [tab, setTab] = useState("work"),
    [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [history, setHistory] = useState(false),
    [files, setFiles] = useState(data.attachments),
    [hint, setHint] = useState(""),
    [helpBusy, setHelpBusy] = useState(false),
    [reference, setReference] = useState<{
      title: string;
      content: string;
      version: number;
    } | null>(null);
  const q = h.questions[index],
    answered = h.questions.filter((q) => {
      const v = draft.answers[q.id];
      return Array.isArray(v) ? v.length : Boolean(v?.trim());
    }).length;
  const due = homeworkDue(h, initial, data.recipients[0]?.extension_at),
    closed = !attemptIsEditable(
      h,
      initial,
      data.recipients[0]?.extension_at ?? null,
      now,
    );
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {initial.revision_feedback && (
        <Notice>
          <strong>Revision requested · Attempt {initial.attempt_number}</strong>
          <p className="whitespace-pre-wrap mt-2">
            {initial.revision_feedback}
          </p>
          <p className="mt-2">Due {formatHomeworkDate(due, h.timezone)}</p>
        </Notice>
      )}
      <div className="flex flex-wrap gap-3 items-center justify-between border-y py-4 mb-5">
        <p role="status" aria-live="polite" className="text-sm">
          {draft.status}
        </p>
        <p className="text-sm">
          {answered} / {h.questions.length} answered · Due{" "}
          {formatHomeworkDate(due, h.timezone)}
        </p>
        <Button
          variant="outline"
          disabled={busy || closed || Boolean(draft.recovery)}
          onClick={() =>
            run(async () => {
              await draft.flush();
            })
          }
        >
          Save now
        </Button>
      </div>
      {draft.recovery && (
        <Notice>
          Your browser has an unsaved draft. Review your server-saved answers,
          then choose whether to restore it.
          <div className="flex flex-wrap gap-2 mt-3">
            <Button onClick={draft.restore} disabled={closed}>
              Restore browser draft
            </Button>
            <Button variant="outline" onClick={draft.discard}>
              Keep server answers
            </Button>
          </div>
        </Notice>
      )}
      {(error || draft.error) && (
        <Notice error>
          {error || draft.error}
          <p className="mt-2">
            Keep this page open. A newer saved version requires reloading and
            reviewing your browser draft.
          </p>
        </Notice>
      )}
      {closed && (
        <Notice>
          This homework is closed. Your saved responses remain available. Ask
          your teacher for an extension.
        </Notice>
      )}
      <nav aria-label="Homework stages" className="flex gap-2 mb-6">
        <Button
          variant={tab === "brief" ? "default" : "outline"}
          onClick={() => setTab("brief")}
        >
          Brief
        </Button>
        <Button
          variant={tab === "work" ? "default" : "outline"}
          onClick={() => setTab("work")}
        >
          Work
        </Button>
        <Button
          variant={tab === "review" ? "default" : "outline"}
          onClick={() => setTab("review")}
        >
          Review
        </Button>
      </nav>
      {tab === "brief" ? (
        <HomeworkPanel>
          <HomeworkBrief data={data} />
          <Button onClick={() => setTab("work")}>Continue working</Button>
        </HomeworkPanel>
      ) : tab === "review" ? (
        <div className="space-y-5">
          <HomeworkPanel>
            <h2 className="text-2xl mb-3">One last look</h2>
            <p>
              Check every required response. Submission locks this attempt until
              your teacher requests a revision.
            </p>
          </HomeworkPanel>
          {h.questions.map((question, i) => (
            <HomeworkPanel key={question.id}>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                Question {i + 1} · {question.required ? "Required" : "Optional"}
              </p>
              <QuestionResponse
                question={question}
                value={draft.answers[question.id]}
                readOnly
                attachments={files}
                homeworkId={h.id}
              />
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setIndex(i);
                  setTab("work");
                }}
              >
                Edit response
              </Button>
            </HomeworkPanel>
          ))}
          <Button
            disabled={busy || closed || Boolean(draft.recovery)}
            onClick={() => {
              try {
                validateAnswers(h.questions, draft.answers, true);
                setError("");
                setConfirm(true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Submit homework
          </Button>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[190px_1fr] gap-5 items-start">
          <HomeworkPanel className="!p-4">
            <h2 className="text-base mb-3">Your progress</h2>
            <nav
              aria-label="Questions"
              className="grid grid-cols-5 lg:grid-cols-2 gap-2"
            >
              {h.questions.map((question, i) => (
                <Button
                  key={question.id}
                  variant={i === index ? "default" : "outline"}
                  aria-current={i === index ? "true" : undefined}
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setIndex(i);
                    setHint("");
                  }}
                >
                  {i + 1}
                  {draft.answers[question.id]?.length ? " ✓" : ""}
                </Button>
              ))}
            </nav>
            <p className="text-xs text-muted-foreground mt-4">
              Required questions must be answered. Your work saves as you go.
            </p>
          </HomeworkPanel>
          <HomeworkPanel>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
              Question {index + 1} · {q.required ? "Required" : "Optional"}
            </p>
            <fieldset disabled={busy || closed || Boolean(draft.recovery)}>
              <QuestionResponse
                question={q}
                value={draft.answers[q.id]}
                onChange={(v) => draft.change({ ...draft.answers, [q.id]: v })}
                attachments={files}
                homeworkId={h.id}
                uploading={busy}
                onUpload={(file) =>
                  run(async () => {
                    await draft.flush();
                    const form = new FormData();
                    form.set("attemptId", initial.id);
                    form.set("questionId", q.id);
                    form.set("file", file);
                    const attached = await homeworkRequest<
                      Attachment & { attempt: Attempt }
                    >(`/api/homework/${h.id}/attachments`, {
                      method: "POST",
                      body: form,
                    });
                    setFiles((f) => [...f, attached]);
                    draft.acceptServer(attached.attempt);
                  })
                }
                onRemove={(file) =>
                  run(async () => {
                    await draft.flush();
                    if (file.attempt_id !== initial.id) {
                      draft.change({
                        ...draft.answers,
                        [q.id]: (draft.answers[q.id] as string[]).filter(
                          (id) => id !== file.id,
                        ),
                      });
                      return;
                    }
                    const result = await homeworkRequest<Attempt>(
                      `/api/homework/${h.id}/attachments`,
                      {
                        method: "DELETE",
                        body: JSON.stringify({
                          attemptId: initial.id,
                          attachmentId: file.id,
                        }),
                      },
                    );
                    draft.acceptServer(result);
                    setFiles((f) => f.filter((a) => a.id !== file.id));
                  })
                }
              />
            </fieldset>
            <div className="flex gap-2 flex-wrap border-t mt-6 pt-4">
              <Button
                variant="outline"
                disabled={busy || index === 0}
                onClick={() => {
                  setIndex((i) => i - 1);
                  setHint("");
                }}
              >
                Previous
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  if (index < h.questions.length - 1) {
                    setIndex((i) => i + 1);
                    setHint("");
                  } else setTab("review");
                }}
              >
                {index === h.questions.length - 1
                  ? "Review answers"
                  : "Next question"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-5">
              {h.allow_references && (
                <Button
                  variant="ghost"
                  disabled={helpBusy}
                  onClick={async () => {
                    setHelpBusy(true);
                    try {
                      setReference(
                        await homeworkRequest(
                          `/api/homework/${h.id}/reference`,
                        ),
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setHelpBusy(false);
                    }
                  }}
                >
                  Open lesson reference
                </Button>
              )}
              {h.allow_hints && (
                <Button
                  variant="ghost"
                  disabled={closed || helpBusy || busy}
                  onClick={async () => {
                    setHelpBusy(true);
                    setError("");
                    try {
                      const result = await homeworkRequest<{ hint: string }>(
                        `/api/homework/${h.id}/help`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            attemptId: initial.id,
                            questionId: q.id,
                          }),
                        },
                      );
                      setHint(result.hint);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setHelpBusy(false);
                    }
                  }}
                >
                  {helpBusy ? "Loading…" : "Ask for a concept hint"}
                </Button>
              )}
            </div>
            {hint && <Notice>{hint}</Notice>}
            <p className="text-xs text-muted-foreground mt-3">
              Use this assignment’s help controls. General AI tools are paused
              while you have an editable homework attempt.
            </p>
          </HomeworkPanel>
        </div>
      )}
      {data.attempts.some((a) => a.submitted_at) && (
        <Button
          className="mt-5"
          variant="outline"
          onClick={() => setHistory(true)}
        >
          Previous attempts & feedback
        </Button>
      )}
      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-3xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Previous attempts & feedback</DialogTitle>
            <DialogDescription>
              Read the released feedback while you revise. Earlier submissions
              stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <StudentSubmitted
            data={{
              ...data,
              attempts: data.attempts.filter((a) => a.submitted_at),
            }}
          />
        </DialogContent>
      </Dialog>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="Submit your homework?"
        description="Your saved answers will be sent to your teacher. You can read this attempt afterwards."
        busy={busy}
        label="Submit homework"
        onConfirm={() =>
          run(async () => {
            const version = await draft.flush();
            await command(h.id, {
              action: "submit",
              attemptId: initial.id,
              version,
            });
            draft.clear();
            setConfirm(false);
            await refresh();
          })
        }
      >
        {error && <Notice error>{error}</Notice>}
      </Confirm>
      <Dialog
        open={Boolean(reference)}
        onOpenChange={(open) => {
          if (!open) setReference(null);
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-3xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{reference?.title}</DialogTitle>
            <DialogDescription>
              Assigned lesson version {reference?.version}
            </DialogDescription>
          </DialogHeader>
          <div className="prose dark:prose-invert max-w-none">
            <ReactMarkdown skipHtml>{reference?.content ?? ""}</ReactMarkdown>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
function StudentSubmitted({ data }: { data: HomeworkDetail }) {
  const [attemptId, setAttemptId] = useState(data.attempts[0].id),
    [tab, setTab] = useState("receipt");
  const h = data.homework,
    a = data.attempts.find((a) => a.id === attemptId) ?? data.attempts[0],
    grade = data.grades.find((g) => g.attempt_id === a.id),
    possible = h.questions.reduce((n, q) => n + q.points, 0),
    score = grade
      ? Object.values(grade.marks).reduce((n, m) => n + m.score, 0)
      : null;
  return (
    <>
      <HomeworkPanel>
        <p className="text-xs uppercase tracking-widest text-primary mb-3">
          {grade ? "Feedback released" : "Submitted successfully"}
        </p>
        <h2 className="text-3xl mb-4">
          {grade
            ? "Your next step starts here."
            : "Your work is with your teacher."}
        </h2>
        <p>
          Attempt {a.attempt_number} ·{" "}
          {formatHomeworkDate(a.submitted_at, h.timezone)} ·{" "}
          {a.late ? "Submitted late" : "Submitted on time"}
        </p>
        <StatRow
          items={[
            {
              label: "Score",
              value: score === null ? "Pending" : `${score}/${possible}`,
            },
            { label: "Questions", value: h.questions.length },
            { label: "Status", value: grade ? "Marked" : "In review" },
          ]}
        />
        {!grade && (
          <p>
            Marks and feedback will appear after your teacher releases them.
          </p>
        )}
        {grade && (
          <p className="whitespace-pre-wrap">
            {grade.feedback || "Review the question feedback below."}
          </p>
        )}
        <div className="flex gap-2 flex-wrap mt-5">
          <Button
            onClick={() => setTab(tab === "receipt" ? "answers" : "receipt")}
          >
            {tab === "receipt" ? "View answers & feedback" : "View receipt"}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/students/homework/performance">My performance</Link>
          </Button>
        </div>
      </HomeworkPanel>
      {data.attempts.length > 1 && (
        <label className="grid gap-2 mt-5 text-sm">
          Attempt history
          <select
            className="input-field"
            value={a.id}
            onChange={(e) => setAttemptId(e.target.value)}
          >
            {data.attempts
              .filter((a) => a.submitted_at)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  Attempt {a.attempt_number}
                </option>
              ))}
          </select>
        </label>
      )}
      {tab === "answers" && (
        <div className="space-y-5 mt-5">
          {h.questions.map((q, i) => (
            <HomeworkPanel key={q.id}>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
                Question {i + 1}
                {grade
                  ? ` · ${grade.marks[q.id]?.score ?? 0} / ${q.points}`
                  : ""}
              </p>
              <QuestionResponse
                question={q}
                value={a.answers[q.id]}
                readOnly
                attachments={data.attachments}
                homeworkId={h.id}
              />
              {grade && (
                <Notice>
                  {grade.marks[q.id]?.feedback ||
                    "No additional feedback for this question."}
                  {grade.marks[q.id]?.criteria && (
                    <ul className="mt-3 space-y-1">
                      {q.rubric.map((r, j) => (
                        <li key={j}>
                          {r.label}: {grade.marks[q.id].criteria?.[j]} /{" "}
                          {r.points}
                        </li>
                      ))}
                    </ul>
                  )}
                </Notice>
              )}
            </HomeworkPanel>
          ))}
        </div>
      )}
    </>
  );
}
