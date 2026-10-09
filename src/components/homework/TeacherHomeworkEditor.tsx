"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  draftSchema,
  type DraftQuestion,
  type HomeworkDraft,
  type HomeworkDetail,
} from "@/lib/homework/domain";
import type { HomeworkSource } from "@/lib/homework/sources";
import {
  HomeworkHeader,
  HomeworkPanel,
  Field,
  fieldClass,
  Notice,
  Confirm,
  QuestionResponse,
  homeworkRequest,
  command,
  utcInput,
  utcValue,
  formatHomeworkDate,
  useHomeworkLeaveWarning,
} from "./shared";
type LessonOption = {
  id: string;
  title: string;
  gradelevel: string;
  subject: string;
};
const newQuestion = (objectiveId: string): DraftQuestion => ({
  id: crypto.randomUUID(),
  type: "written",
  prompt: "",
  objectiveId,
  points: 4,
  required: true,
  options: [],
  correctAnswer: "",
  guidance: "",
  rubric: [],
});
export function TeacherHomeworkEditor({ id }: { id?: string }) {
  const router = useRouter(),
    search = useSearchParams(),
    [lessons, setLessons] = useState<LessonOption[]>([]),
    [source, setSource] = useState<HomeworkSource | null>(null),
    [form, setForm] = useState<HomeworkDraft | null>(null),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [recipients, setRecipients] = useState<string[]>([]),
    [publishOpen, setPublishOpen] = useState(false),
    [aiOpen, setAiOpen] = useState(false),
    [aiBrief, setAiBrief] = useState(""),
    [dirty, setDirty] = useState(false);
  const savedId = useRef(id),
    version = useRef(1);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    (async () => {
      try {
        const options = await homeworkRequest<LessonOption[]>(
          "/api/homework/sources",
        );
        if (alive) setLessons(options);
        if (id) {
          const detail = await homeworkRequest<HomeworkDetail>(
            `/api/homework/${id}`,
          );
          if (detail.homework.status !== "draft")
            throw new Error(
              "Published questions are locked. Use Duplicate from the assignment page.",
            );
          const s = await homeworkRequest<HomeworkSource>(
            `/api/homework/sources?lessonId=${detail.homework.lesson_id}&publicationId=${detail.homework.publication_id}`,
          );
          if (alive) {
            setSource(s);
            version.current = detail.homework.version;
            const h = detail.homework;
            setForm({
              title: h.title,
              instructions: h.instructions,
              lessonId: h.lesson_id,
              objectiveIds: h.objectives.map((o) => o.id),
              questions: h.questions.map((q) => ({
                ...q,
                ...detail.keys![q.id],
              })),
              dueAt: h.due_at,
              closeAt: h.close_at,
              timezone: h.timezone,
              acceptLate: h.accept_late,
              allowHints: h.allow_hints,
              allowReferences: h.allow_references,
              minutes: h.minutes,
            });
            setRecipients(s.eligibleStudents.map((s) => s.id));
          }
        } else if (search.get("lessonId"))
          await chooseLesson(search.get("lessonId")!);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, search]);
  useHomeworkLeaveWarning(dirty);
  async function chooseLesson(lessonId: string) {
    setError("");
    setBusy(true);
    try {
      const s = await homeworkRequest<HomeworkSource>(
        `/api/homework/sources?lessonId=${lessonId}`,
      );
      setSource(s);
      setForm({
        title: s.title + " homework",
        instructions: "Answer in your own words and show your reasoning.",
        lessonId: s.lessonId,
        objectiveIds: s.objectives.map((o) => o.id),
        questions: [newQuestion(s.objectives[0]?.id ?? "")],
        dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        closeAt: null,
        timezone: "UTC",
        acceptLate: true,
        allowHints: false,
        allowReferences: true,
        minutes: 30,
      });
      setRecipients(s.eligibleStudents.map((s) => s.id));
      setDirty(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function update(partial: Partial<HomeworkDraft>) {
    setForm((f) => (f ? { ...f, ...partial } : null));
    setDirty(true);
    setMessage("");
  }
  function changeQuestion(index: number, partial: Partial<DraftQuestion>) {
    if (form)
      update({
        questions: form.questions.map((q, i) =>
          i === index ? { ...q, ...partial } : q,
        ),
      });
  }
  async function save() {
    if (!form) throw new Error("Select a lesson first");
    draftSchema.parse(form);
    const result = await homeworkRequest<{ id: string; version: number }>(
      savedId.current ? `/api/homework/${savedId.current}` : "/api/homework",
      {
        method: savedId.current ? "PATCH" : "POST",
        body: JSON.stringify({
          ...form,
          publicationId: source?.publicationId,
          version: version.current,
        }),
      },
    );
    savedId.current = result.id;
    version.current = result.version;
    setDirty(false);
    setMessage("Draft saved. Students cannot see it yet.");
    return result.id;
  }
  async function run(task: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save homework");
    } finally {
      setBusy(false);
    }
  }
  const questionTotal = form?.questions.reduce((n, q) => n + q.points, 0) ?? 0;
  return (
    <DashboardLayout>
      <HomeworkHeader
        title={id ? "Edit homework" : "Create homework"}
        description="Connect practice to the lesson’s published learning objectives."
        actions={
          <Button variant="outline" asChild>
            <Link href="/teachers/homework">All homework</Link>
          </Button>
        }
      />
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {busy && (
        <p role="status" className="mb-4 text-muted-foreground">
          Working…
        </p>
      )}
      <fieldset disabled={busy} className="min-w-0">
        <div className="flex flex-wrap gap-2 border-b pb-4 mb-6">
          {["Lesson", "Questions", "Assign", "Preview"].map((s, i) => (
            <Button
              key={s}
              variant={step === i ? "default" : "ghost"}
              disabled={(!form && i > 0) || busy}
              onClick={() => setStep(i)}
              aria-current={step === i ? "step" : undefined}
            >
              {i + 1}. {s}
            </Button>
          ))}
        </div>
        {step === 0 && (
          <div className="grid lg:grid-cols-[1fr_260px] gap-5">
            <HomeworkPanel>
              <Field label="Published lesson">
                <select
                  className={fieldClass}
                  value={source?.lessonId ?? ""}
                  disabled={Boolean(savedId.current) || busy}
                  onChange={(e) => {
                    if (
                      dirty &&
                      !window.confirm(
                        "Replace unsaved homework with a different lesson? Save the draft first to keep it.",
                      )
                    )
                      return;
                    if (e.target.value) chooseLesson(e.target.value);
                  }}
                >
                  <option value="">Choose a lesson</option>
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} · {l.subject} · {l.gradelevel}
                    </option>
                  ))}
                </select>
              </Field>
              {!lessons.length && !busy && (
                <Notice>
                  Publish a lesson in Lesson Studio before creating homework.
                </Notice>
              )}
              {source && form && (
                <>
                  <Badge variant="secondary">
                    Published version {source.publicationVersion}
                  </Badge>
                  <h2 className="text-2xl mt-5 mb-3">Learning objectives</h2>
                  {source.objectives.map((o) => (
                    <label
                      key={o.id}
                      className="flex gap-3 py-4 border-b text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={form.objectiveIds.includes(o.id)}
                        onChange={(e) =>
                          update({
                            objectiveIds: e.target.checked
                              ? [...form.objectiveIds, o.id]
                              : form.objectiveIds.filter((id) => id !== o.id),
                          })
                        }
                      />
                      {o.text}
                    </label>
                  ))}
                  <Notice>
                    This lesson version is preserved for the assignment. Every
                    question must use a selected objective.
                  </Notice>
                </>
              )}
            </HomeworkPanel>
            <HomeworkPanel>
              <h2 className="text-xl mb-3">A grounded starting point</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Write your own questions, import approved quizzes, or ask AI for
                a draft you can edit.
              </p>
              {source && (
                <Button variant="outline" asChild>
                  <Link href={`/teachers/lessons/${source.lessonId}`}>
                    Open Lesson Studio
                  </Link>
                </Button>
              )}
            </HomeworkPanel>
          </div>
        )}
        {form && step === 1 && (
          <div className="grid lg:grid-cols-[1fr_220px] gap-5">
            <div className="space-y-5">
              <HomeworkPanel>
                <Field label="Homework title">
                  <input
                    className={fieldClass}
                    value={form.title}
                    onChange={(e) => update({ title: e.target.value })}
                    maxLength={200}
                  />
                </Field>
                <Field label="Student instructions">
                  <textarea
                    className={`${fieldClass} h-auto min-h-24`}
                    value={form.instructions}
                    onChange={(e) => update({ instructions: e.target.value })}
                    maxLength={10000}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setAiOpen(true)}
                  >
                    Draft with AI
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !source?.importedQuestions.length}
                    onClick={() => {
                      const imported = source!.importedQuestions.filter((q) =>
                        form.objectiveIds.includes(q.objectiveId),
                      );
                      update({
                        questions: [
                          ...form.questions.filter((q) => q.prompt.trim()),
                          ...imported.map((q) => ({
                            ...q,
                            id: crypto.randomUUID(),
                          })),
                        ].slice(0, 50),
                      });
                      setMessage(
                        "Imported lesson questions. Review prompts and marking guidance before publishing.",
                      );
                    }}
                  >
                    Import selected-objective quizzes
                  </Button>
                </div>
              </HomeworkPanel>
              {form.questions.map((q, index) => (
                <HomeworkPanel key={q.id}>
                  <div className="flex justify-between items-center gap-3 mb-4">
                    <h2 className="text-xl">Question {index + 1}</h2>
                    <Button
                      variant="ghost"
                      disabled={form.questions.length === 1}
                      onClick={() =>
                        update({
                          questions: form.questions.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Response type">
                      <select
                        className={fieldClass}
                        value={q.type}
                        onChange={(e) => {
                          const type = e.target.value as DraftQuestion["type"];
                          const choice = [
                            "multiple_choice",
                            "multiple_select",
                          ].includes(type);
                          const wasChoice = [
                            "multiple_choice",
                            "multiple_select",
                          ].includes(q.type);
                          const key = wasChoice ? q.correctAnswer : "";
                          changeQuestion(index, {
                            type,
                            options: choice
                              ? wasChoice
                                ? q.options
                                : ["Option A", "Option B"]
                              : [],
                            correctAnswer:
                              type === "true_false"
                                ? "True"
                                : type === "multiple_select"
                                  ? Array.isArray(key)
                                    ? key
                                    : key
                                      ? [key]
                                      : []
                                  : type === "multiple_choice"
                                    ? Array.isArray(key)
                                      ? (key[0] ?? "")
                                      : key
                                    : "",
                            rubric: [],
                          });
                        }}
                      >
                        {[
                          ["multiple_choice", "Multiple choice · one answer"],
                          [
                            "multiple_select",
                            "Multiple choice · multiple answers",
                          ],
                          ["true_false", "True / false"],
                          ["short_answer", "Short written answer"],
                          ["written", "Extended written answer"],
                          ["file", "File upload"],
                        ].map(([v, t]) => (
                          <option key={v} value={v}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Maximum marks">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        className={fieldClass}
                        value={q.points}
                        onChange={(e) =>
                          changeQuestion(index, {
                            points: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Question prompt">
                    <textarea
                      className={`${fieldClass} min-h-24 h-auto`}
                      value={q.prompt}
                      onChange={(e) =>
                        changeQuestion(index, { prompt: e.target.value })
                      }
                      maxLength={5000}
                    />
                  </Field>
                  <Field label="Learning objective">
                    <select
                      className={fieldClass}
                      value={q.objectiveId}
                      onChange={(e) =>
                        changeQuestion(index, { objectiveId: e.target.value })
                      }
                    >
                      <option value="">Select an objective</option>
                      {source?.objectives
                        .filter((o) => form.objectiveIds.includes(o.id))
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.text}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <label className="flex gap-2 mb-5 text-sm">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) =>
                        changeQuestion(index, { required: e.target.checked })
                      }
                    />
                    Required response
                  </label>
                  {["multiple_choice", "multiple_select"].includes(q.type) && (
                    <Field label="Options · one per line">
                      <textarea
                        className={`${fieldClass} h-auto min-h-24`}
                        value={q.options.join("\n")}
                        onChange={(e) => {
                          const options = e.target.value.split("\n");
                          changeQuestion(index, {
                            options,
                            correctAnswer: Array.isArray(q.correctAnswer)
                              ? q.correctAnswer.filter((answer) =>
                                  options.includes(answer),
                                )
                              : options.includes(q.correctAnswer)
                                ? q.correctAnswer
                                : "",
                          });
                        }}
                      />
                    </Field>
                  )}
                  {q.type === "multiple_select" && (
                    <fieldset className="space-y-2 mb-5">
                      <legend className="text-sm font-medium mb-2">
                        Correct answers · teacher only
                      </legend>
                      <p className="text-xs text-muted-foreground">
                        Select every correct option. Exact matches receive full
                        provisional marks; you can award partial credit when
                        marking.
                      </p>
                      {q.options
                        .filter((option) => option.trim())
                        .map((option, i) => (
                          <label
                            key={i}
                            className="flex gap-3 p-3 border rounded-md text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={
                                Array.isArray(q.correctAnswer) &&
                                q.correctAnswer.includes(option)
                              }
                              onChange={(e) => {
                                const selected = Array.isArray(q.correctAnswer)
                                  ? q.correctAnswer
                                  : [];
                                changeQuestion(index, {
                                  correctAnswer: e.target.checked
                                    ? [...selected, option]
                                    : selected.filter(
                                        (answer) => answer !== option,
                                      ),
                                });
                              }}
                              className="accent-primary"
                            />
                            {option}
                          </label>
                        ))}
                    </fieldset>
                  )}
                  {["multiple_choice", "true_false"].includes(q.type) && (
                    <Field label="Correct answer · teacher only">
                      <select
                        className={fieldClass}
                        value={
                          typeof q.correctAnswer === "string"
                            ? q.correctAnswer
                            : ""
                        }
                        onChange={(e) =>
                          changeQuestion(index, {
                            correctAnswer: e.target.value,
                          })
                        }
                      >
                        <option value="">Choose the correct answer</option>
                        {(q.type === "true_false"
                          ? ["True", "False"]
                          : q.options
                        ).map((o, i) => (
                          <option key={i} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label="Marking guidance · teacher only">
                    <textarea
                      className={`${fieldClass} h-auto min-h-20`}
                      value={q.guidance}
                      onChange={(e) =>
                        changeQuestion(index, { guidance: e.target.value })
                      }
                      maxLength={5000}
                    />
                  </Field>
                  {![
                    "multiple_choice",
                    "multiple_select",
                    "true_false",
                  ].includes(q.type) && (
                    <div>
                      <h3 className="text-lg mb-2">Marking rubric</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Students see these criteria. Their marks must sum to the
                        question’s maximum.
                      </p>
                      {q.rubric.map((r, ri) => (
                        <div
                          key={ri}
                          className="grid grid-cols-[1fr_70px_auto] gap-2 mb-3"
                        >
                          <input
                            aria-label={`Question ${index + 1} criterion ${ri + 1}`}
                            className={fieldClass}
                            value={r.label}
                            onChange={(e) =>
                              changeQuestion(index, {
                                rubric: q.rubric.map((v, j) =>
                                  j === ri
                                    ? { ...v, label: e.target.value }
                                    : v,
                                ),
                              })
                            }
                          />
                          <input
                            aria-label={`Criterion ${ri + 1} maximum marks`}
                            type="number"
                            min="1"
                            className={fieldClass}
                            value={r.points}
                            onChange={(e) =>
                              changeQuestion(index, {
                                rubric: q.rubric.map((v, j) =>
                                  j === ri
                                    ? { ...v, points: Number(e.target.value) }
                                    : v,
                                ),
                              })
                            }
                          />
                          <Button
                            aria-label={`Remove criterion ${ri + 1}`}
                            variant="ghost"
                            onClick={() =>
                              changeQuestion(index, {
                                rubric: q.rubric.filter((_, j) => j !== ri),
                              })
                            }
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={q.rubric.length >= 20}
                        onClick={() =>
                          changeQuestion(index, {
                            rubric: [...q.rubric, { label: "", points: 1 }],
                          })
                        }
                      >
                        Add criterion
                      </Button>
                    </div>
                  )}
                </HomeworkPanel>
              ))}
            </div>
            <aside>
              <HomeworkPanel>
                <h2 className="text-xl mb-3">Question summary</h2>
                <p>
                  {form.questions.length} questions · {questionTotal} marks
                </p>
                <Notice>
                  Review every generated question and key before publishing.
                </Notice>
                <Button
                  disabled={
                    form.questions.length >= 50 || !form.objectiveIds.length
                  }
                  onClick={() =>
                    update({
                      questions: [
                        ...form.questions,
                        newQuestion(form.objectiveIds[0]),
                      ],
                    })
                  }
                >
                  Add question
                </Button>
              </HomeworkPanel>
            </aside>
          </div>
        )}
        {form && step === 2 && (
          <div className="grid lg:grid-cols-2 gap-5">
            <HomeworkPanel>
              <h2 className="text-2xl mb-3">Who is this for?</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Active students in this lesson’s school and grade.
              </p>
              {!source?.eligibleStudents.length ? (
                <Notice error>
                  No eligible recipients. Assign the lesson to an organization
                  and configure active teacher/student memberships before
                  publishing.
                </Notice>
              ) : (
                <>
                  <label className="flex gap-3 mb-4">
                    <input
                      type="checkbox"
                      checked={
                        recipients.length ===
                        Math.min(200, source.eligibleStudents.length)
                      }
                      onChange={(e) =>
                        setRecipients(
                          e.target.checked
                            ? source.eligibleStudents
                                .slice(0, 200)
                                .map((s) => s.id)
                            : [],
                        )
                      }
                    />
                    Select up to 200 · {recipients.length} selected
                  </label>
                  {source.eligibleStudents.map((s) => (
                    <label key={s.id} className="flex gap-3 py-3 border-b">
                      <input
                        type="checkbox"
                        checked={recipients.includes(s.id)}
                        onChange={(e) =>
                          setRecipients(
                            e.target.checked
                              ? [...recipients, s.id]
                              : recipients.filter((id) => id !== s.id),
                          )
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </>
              )}
            </HomeworkPanel>
            <HomeworkPanel>
              <h2 className="text-2xl mb-4">Deadline & support</h2>
              <Field label="School display timezone">
                <input
                  className={fieldClass}
                  value={form.timezone}
                  onChange={(e) => update({ timezone: e.target.value })}
                  placeholder="UTC or Africa/Accra"
                />
              </Field>
              <Field label="Due date and time · enter in UTC">
                <input
                  className={fieldClass}
                  type="datetime-local"
                  value={utcInput(form.dueAt)}
                  onChange={(e) => {
                    if (e.target.value)
                      update({ dueAt: utcValue(e.target.value) });
                  }}
                />
              </Field>
              <Field label="Estimated effort · minutes">
                <input
                  className={fieldClass}
                  type="number"
                  min="1"
                  max="600"
                  value={form.minutes}
                  onChange={(e) => update({ minutes: Number(e.target.value) })}
                />
              </Field>
              <Field label="Late submissions">
                <select
                  className={fieldClass}
                  value={form.acceptLate ? "accept" : "stop"}
                  onChange={(e) =>
                    update({ acceptLate: e.target.value === "accept" })
                  }
                >
                  <option value="accept">
                    Accept late work with a late label
                  </option>
                  <option value="stop">Stop submissions at the due date</option>
                </select>
              </Field>
              <label className="flex gap-3 mb-4 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(form.closeAt)}
                  onChange={(e) =>
                    update({ closeAt: e.target.checked ? form.dueAt : null })
                  }
                />
                Set a hard closing date
              </label>
              {form.closeAt && (
                <Field label="Hard closing date · UTC">
                  <input
                    className={fieldClass}
                    type="datetime-local"
                    value={utcInput(form.closeAt)}
                    onChange={(e) => {
                      if (e.target.value)
                        update({ closeAt: utcValue(e.target.value) });
                    }}
                  />
                </Field>
              )}
              <label className="flex gap-3 mb-4">
                <input
                  type="checkbox"
                  checked={form.allowReferences}
                  onChange={(e) =>
                    update({ allowReferences: e.target.checked })
                  }
                />
                Allow the assigned lesson reference
              </label>
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  checked={form.allowHints}
                  onChange={(e) => update({ allowHints: e.target.checked })}
                />
                Allow concept hints
              </label>
              <Notice>
                Hints explain concepts without selecting answers. Teachers
                approve all final marks.
              </Notice>
            </HomeworkPanel>
          </div>
        )}
        {form && step === 3 && (
          <div className="space-y-5">
            <HomeworkPanel>
              <Badge variant="secondary">
                Student preview · Lesson v{source?.publicationVersion}
              </Badge>
              <h2 className="text-3xl mt-4 mb-3">{form.title}</h2>
              <p className="whitespace-pre-wrap mb-5">{form.instructions}</p>
              <p className="text-sm text-muted-foreground">
                {form.questions.length} questions · {questionTotal} marks ·{" "}
                {form.minutes} minutes · {recipients.length} recipients
              </p>
              <p className="text-sm mt-3">
                Due{" "}
                {(() => {
                  try {
                    return formatHomeworkDate(form.dueAt, form.timezone);
                  } catch {
                    return "Check the school timezone";
                  }
                })()}
              </p>
              <Notice>
                Publishing locks the questions, rubric, answer keys, and lesson
                version. You can extend deadlines and request revisions later.
              </Notice>
            </HomeworkPanel>
            {form.questions.map((q) => (
              <HomeworkPanel key={q.id}>
                <QuestionResponse question={q} readOnly />
              </HomeworkPanel>
            ))}
          </div>
        )}
        {form && (
          <footer className="flex flex-wrap justify-between gap-3 border-t mt-6 pt-5">
            <Button
              variant="outline"
              disabled={busy || step === 0}
              onClick={() => setStep((n) => n - 1)}
            >
              Back
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await save();
                  })
                }
              >
                Save draft
              </Button>
              {step < 3 ? (
                <Button disabled={busy} onClick={() => setStep((n) => n + 1)}>
                  Continue
                </Button>
              ) : (
                <Button
                  disabled={busy || !recipients.length}
                  onClick={() => setPublishOpen(true)}
                >
                  Publish homework
                </Button>
              )}
            </div>
          </footer>
        )}
      </fieldset>
      <Confirm
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish this homework?"
        description={`${recipients.length} students will receive the questions and deadline. Your marking keys stay private.`}
        busy={busy}
        label="Publish to students"
        onConfirm={() =>
          run(async () => {
            const homeworkId = await save();
            await command(homeworkId, {
              action: "publish",
              version: version.current,
              recipients,
            });
            setDirty(false);
            router.push(`/teachers/homework/${homeworkId}`);
          })
        }
      >
        {error && <Notice error>{error}</Notice>}
      </Confirm>
      <Confirm
        open={aiOpen}
        onOpenChange={setAiOpen}
        title="Draft questions with AI"
        description="Generate editable questions from your selected objectives. Review every question before publishing."
        busy={busy}
        label="Generate draft"
        onConfirm={() =>
          run(async () => {
            if (!form) throw new Error("Select a lesson");
            const result = await homeworkRequest<{
              questions: DraftQuestion[];
            }>("/api/homework/generate", {
              method: "POST",
              body: JSON.stringify({
                lessonId: form.lessonId,
                publicationId: source?.publicationId,
                objectiveIds: form.objectiveIds,
                count: 5,
                brief: aiBrief,
              }),
            });
            update({
              questions: [
                ...form.questions.filter((q) => q.prompt.trim()),
                ...result.questions,
              ].slice(0, 50),
            });
            setAiOpen(false);
          })
        }
      >
        {error && <Notice error>{error}</Notice>}
        <Field label="Focus for the draft">
          <textarea
            className={`${fieldClass} h-auto min-h-24`}
            value={aiBrief}
            onChange={(e) => setAiBrief(e.target.value)}
            maxLength={2000}
          />
        </Field>
      </Confirm>
    </DashboardLayout>
  );
}
