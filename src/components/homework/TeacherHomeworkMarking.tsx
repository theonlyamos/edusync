"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  validateMarks,
  provisionalMarks,
  type Marks,
  type Grade,
  type HomeworkDetail,
} from "@/lib/homework/domain";
import {
  HomeworkHeader,
  HomeworkPanel,
  Notice,
  DataState,
  QuestionResponse,
  Field,
  fieldClass,
  Confirm,
  useHomeworkData,
  command,
  formatHomeworkDate,
  utcInput,
  utcValue,
  useHomeworkLeaveWarning,
} from "./shared";
export function TeacherHomeworkMarking({ id }: { id: string }) {
  const search = useSearchParams(),
    [studentId, setStudentId] = useState(search.get("studentId") ?? ""),
    [attemptId, setAttemptId] = useState(""),
    [questionIndex, setQuestionIndex] = useState(0),
    [marks, setMarks] = useState<Marks>({}),
    [feedback, setFeedback] = useState(""),
    [gradeVersion, setGradeVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [modal, setModal] = useState(""),
    [revisionFeedback, setRevisionFeedback] = useState(""),
    [revisionDue, setRevisionDue] = useState(() =>
      new Date(Date.now() + 3 * 86400000).toISOString(),
    );
  const api = useHomeworkData<HomeworkDetail>(
      `/api/homework/${id}${studentId ? "?studentId=" + studentId : ""}`,
    ),
    data = api.data;
  useHomeworkLeaveWarning(message === "Unsaved grading changes");
  useEffect(() => {
    if (data && !studentId) {
      const candidate = data.attempts.find((a) => a.submitted_at);
      if (candidate) setStudentId(candidate.student_id);
    }
  }, [data, studentId]);
  useEffect(() => {
    if (data && studentId) {
      const a = data.attempts.find((a) => a.submitted_at);
      setAttemptId(a?.id ?? "");
    }
  }, [data, studentId]);
  useEffect(() => {
    if (data && attemptId) {
      const g = data.grades.find((g) => g.attempt_id === attemptId);
      setMarks(g?.marks ?? {});
      setFeedback(g?.feedback ?? "");
      setGradeVersion(g?.version ?? 0);
      setQuestionIndex(0);
    }
  }, [data, attemptId]);
  async function saveGrade() {
    if (!data) throw new Error("Submission unavailable");
    const safe = validateMarks(data.homework.questions, marks);
    const grade = await command<Grade>(id, {
      action: "grade",
      attemptId,
      version: gradeVersion,
      marks: safe,
      feedback,
    });
    setGradeVersion(grade.version);
    setMessage("Grading draft saved privately.");
    return grade.version;
  }
  async function run(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <DashboardLayout>
        <HomeworkHeader title="Mark homework" />
        <DataState
          loading={api.loading}
          error={api.error}
          retry={api.refresh}
        />
      </DashboardLayout>
    );
  const h = data.homework,
    a = data.attempts.find((a) => a.id === attemptId),
    q = h.questions[questionIndex],
    mark = marks[q?.id],
    name =
      data.recipients.find((r) => r.student_id === studentId)?.name ??
      "Student",
    provisional = a
      ? provisionalMarks(h.questions, data.keys ?? {}, a.answers)
      : {},
    total = Object.values(marks).reduce((n, m) => n + m.score, 0),
    possible = h.questions.reduce((n, q) => n + q.points, 0),
    answerKey = data.keys?.[q?.id]?.correctAnswer;
  let ready = false;
  try {
    validateMarks(h.questions, marks, true);
    ready = true;
  } catch {
    /* Incomplete marks keep release disabled. */
  }
  function setMark(partial: Partial<Marks[string]>) {
    setMarks((m) => ({
      ...m,
      [q.id]: { ...(m[q.id] ?? { score: 0, feedback: "" }), ...partial },
    }));
    setMessage("Unsaved grading changes");
  }
  return (
    <DashboardLayout>
      <HomeworkHeader
        title={`${name}’s homework`}
        description={
          a
            ? `${h.title} · Attempt ${a.attempt_number} · ${a.late ? "Late submission" : "On time"} · ${formatHomeworkDate(a.submitted_at, h.timezone)}`
            : h.title
        }
        actions={
          <Button variant="outline" asChild>
            <Link href={`/teachers/homework/${id}`}>Back to submissions</Link>
          </Button>
        }
      />
      <DataState loading={api.loading} error={api.error} retry={api.refresh} />
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <Field label="Student">
          <select
            className={fieldClass}
            disabled={busy}
            value={studentId}
            onChange={(e) => {
              if (
                message === "Unsaved grading changes" &&
                !window.confirm(
                  "Discard unsaved grading changes? Save the draft first to keep them.",
                )
              )
                return;
              setStudentId(e.target.value);
              setMessage("");
            }}
          >
            <option value="">Choose a student</option>
            {data.recipients.map((r) => (
              <option key={r.student_id} value={r.student_id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Submitted attempt">
          <select
            className={fieldClass}
            disabled={busy}
            value={attemptId}
            onChange={(e) => {
              if (
                message === "Unsaved grading changes" &&
                !window.confirm("Discard unsaved grading changes?")
              )
                return;
              setAttemptId(e.target.value);
              setMessage("");
            }}
          >
            {data.attempts
              .filter((a) => a.submitted_at)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  Attempt {a.attempt_number} ·{" "}
                  {formatHomeworkDate(a.submitted_at, h.timezone)}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {!a ? (
        <Notice>This student has not submitted an attempt yet.</Notice>
      ) : (
        <>
          <nav
            className="grid grid-cols-5 gap-2 mb-6"
            aria-label="Marking questions"
          >
            {h.questions.map((q, i) => (
              <Button
                key={q.id}
                variant={i === questionIndex ? "default" : "outline"}
                className="h-auto py-3 min-w-0"
                aria-current={i === questionIndex ? "true" : undefined}
                onClick={() => setQuestionIndex(i)}
                disabled={busy}
              >
                Q{i + 1}
                <span className="hidden sm:inline ml-2">· {q.points}</span>
              </Button>
            ))}
          </nav>
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-5 items-start">
            <HomeworkPanel>
              <QuestionResponse
                question={q}
                value={a.answers[q.id]}
                attachments={data.attachments}
                homeworkId={id}
                readOnly
              />
              <div className="flex flex-wrap gap-2 mt-5">
                <Badge variant="secondary">
                  {a.hint_count} concept hints requested
                </Badge>
                <Badge variant="outline">Submitted response</Badge>
              </div>
              <details className="mt-5 border-t pt-4">
                <summary className="text-sm">
                  Teacher-only marking guidance
                </summary>
                <p className="text-sm whitespace-pre-wrap mt-3">
                  {data.keys?.[q.id]?.guidance ||
                    "Use the question and learning objective to assess the response."}
                </p>
                {provisional[q.id] && (
                  <p className="text-sm mt-3">
                    Answer key:{" "}
                    {Array.isArray(answerKey)
                      ? answerKey.join(", ")
                      : answerKey}{" "}
                    · Provisional score: {provisional[q.id].score}/{q.points}
                  </p>
                )}
              </details>
            </HomeworkPanel>
            <HomeworkPanel>
              <fieldset disabled={busy}>
                <div className="flex justify-between gap-3 mb-5">
                  <h2 className="text-2xl">Marks & feedback</h2>
                  <Badge variant="secondary">
                    {total} / {possible}
                  </Badge>
                </div>
                {q.rubric.map((r, i) => (
                  <Field key={i} label={`${r.label} · / ${r.points}`}>
                    <input
                      className={fieldClass}
                      type="number"
                      min="0"
                      max={r.points}
                      step="0.5"
                      value={mark?.criteria?.[i] ?? ""}
                      onChange={(e) => {
                        const criteria = q.rubric.map((_, j) =>
                          j === i
                            ? Number(e.target.value)
                            : (mark?.criteria?.[j] ?? 0),
                        );
                        setMark({
                          criteria,
                          score: criteria.reduce((n, v) => n + v, 0),
                        });
                      }}
                    />
                  </Field>
                ))}
                <Field label={`Question score · / ${q.points}`}>
                  <input
                    className={fieldClass}
                    type="number"
                    min="0"
                    max={q.points}
                    step="0.5"
                    readOnly={q.rubric.length > 0}
                    value={mark?.score ?? ""}
                    onChange={(e) => {
                      if (e.target.value === "") {
                        setMarks((m) => {
                          const copy = { ...m };
                          delete copy[q.id];
                          return copy;
                        });
                        setMessage("Unsaved grading changes");
                      } else setMark({ score: Number(e.target.value) });
                    }}
                  />
                </Field>
                {provisional[q.id] &&
                  mark &&
                  mark.score !== provisional[q.id].score && (
                    <Field label="Why are you overriding the calculated score?">
                      <textarea
                        className={`${fieldClass} h-auto min-h-20`}
                        value={mark.overrideReason ?? ""}
                        onChange={(e) =>
                          setMark({ overrideReason: e.target.value })
                        }
                        maxLength={1000}
                      />
                    </Field>
                  )}
                <Field label="Feedback for this question">
                  <textarea
                    className={`${fieldClass} h-auto min-h-28`}
                    value={mark?.feedback ?? ""}
                    onChange={(e) => setMark({ feedback: e.target.value })}
                    maxLength={5000}
                  />
                </Field>
                <Field label="Overall feedback">
                  <textarea
                    className={`${fieldClass} h-auto min-h-24`}
                    value={feedback}
                    onChange={(e) => {
                      setFeedback(e.target.value);
                      setMessage("Unsaved grading changes");
                    }}
                    maxLength={10000}
                  />
                </Field>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={() =>
                      run(async () => {
                        await saveGrade();
                      })
                    }
                  >
                    Save private draft
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      data.recipients.findIndex(
                        (r) => r.student_id === studentId,
                      ) >=
                      data.recipients.length - 1
                    }
                    onClick={() =>
                      run(async () => {
                        await saveGrade();
                        setStudentId(
                          data.recipients[
                            data.recipients.findIndex(
                              (r) => r.student_id === studentId,
                            ) + 1
                          ].student_id,
                        );
                      })
                    }
                  >
                    Save & next student
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRevisionFeedback(feedback);
                      setModal("revise");
                    }}
                  >
                    Request revision
                  </Button>
                </div>
              </fieldset>
            </HomeworkPanel>
          </div>
          <footer className="border-t mt-6 pt-5 flex gap-3 flex-wrap items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {Object.keys(marks).length} / {h.questions.length} questions
              marked · Changes are private until release.
            </p>
            <Button
              disabled={busy || !ready}
              onClick={() => setModal("release")}
            >
              Release feedback
            </Button>
          </footer>
        </>
      )}
      <Confirm
        open={Boolean(modal)}
        onOpenChange={(v) => {
          if (!v) setModal("");
        }}
        title={
          modal === "release" ? "Release this feedback?" : "Ask for a revision"
        }
        description={
          modal === "release"
            ? "This student will see the completed marks and feedback."
            : "The prior submission stays intact. A new editable attempt copies the previous answers."
        }
        busy={busy}
        label={modal === "release" ? "Release feedback" : "Request revision"}
        onConfirm={() =>
          run(async () => {
            if (modal === "release") validateMarks(h.questions, marks, true);
            const version = await saveGrade();
            await command(
              id,
              modal === "release"
                ? { action: "release", attemptId, version }
                : {
                    action: "revise",
                    attemptId,
                    version,
                    feedback: revisionFeedback,
                    dueAt: revisionDue,
                  },
            );
            setModal("");
            await api.refresh();
            setMessage(
              modal === "release"
                ? "Feedback released."
                : "Revision requested.",
            );
          })
        }
      >
        {error && <Notice error>{error}</Notice>}
        {modal === "revise" && (
          <>
            <Field label="What should improve?">
              <textarea
                className={`${fieldClass} h-auto min-h-28`}
                value={revisionFeedback}
                onChange={(e) => setRevisionFeedback(e.target.value)}
                maxLength={10000}
              />
            </Field>
            <Field label="Revision deadline · UTC">
              <input
                className={fieldClass}
                type="datetime-local"
                value={utcInput(revisionDue)}
                onChange={(e) => {
                  if (e.target.value) setRevisionDue(utcValue(e.target.value));
                }}
              />
            </Field>
          </>
        )}
      </Confirm>
    </DashboardLayout>
  );
}
