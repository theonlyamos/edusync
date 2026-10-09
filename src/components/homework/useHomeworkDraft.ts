"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  validateAnswers,
  type Answers,
  type Attempt,
  type Question,
  type Attachment,
} from "@/lib/homework/domain";
import { command, HomeworkRequestError } from "./shared";

export function useHomeworkDraft(
  homeworkId: string,
  initial: Attempt,
  questions: Question[],
  attachments: Attachment[],
) {
  const key = `homework:v1:${initial.student_id}:${homeworkId}:${initial.id}`;
  const [answers, setAnswers] = useState(initial.answers),
    [status, setStatus] = useState("All changes saved"),
    [error, setError] = useState(""),
    [recovery, setRecovery] = useState<Answers | null>(null);
  const current = useRef(initial.answers),
    version = useRef(initial.version),
    dirty = useRef(false),
    conflict = useRef(false),
    pending = useRef<Promise<void> | null>(null),
    mounted = useRef(true);
  const persist = useCallback(() => {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ version: version.current, answers: current.current }),
      );
    } catch {
      /* Server saves remain available when browser storage is disabled. */
    }
  }, [key]);
  useEffect(() => {
    mounted.current = true;
    try {
      const value = localStorage.getItem(key);
      if (value) {
        const draft = JSON.parse(value);
        const safe = validateAnswers(questions, draft.answers);
        let missingFiles = false;
        for (const q of questions) {
          const ids = safe[q.id];
          if (q.type !== "file" || !Array.isArray(ids)) continue;
          safe[q.id] = ids.filter((id) =>
            attachments.some(
              (file) => file.id === id && file.question_id === q.id,
            ),
          );
          if (safe[q.id].length !== ids.length) missingFiles = true;
        }
        if (missingFiles)
          setError(
            "Unavailable files were excluded from your browser draft. Upload them again before submitting.",
          );
        if (JSON.stringify(safe) !== JSON.stringify(initial.answers))
          setRecovery(safe);
      }
    } catch {
      setError(
        "A browser draft could not be restored. Your server-saved work is available.",
      );
    }
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", warn);
    };
  }, [key, questions, initial.answers, attachments]);
  const change = useCallback(
    (next: Answers) => {
      current.current = next;
      dirty.current = true;
      setAnswers(next);
      setStatus("Changes waiting to save");
      persist();
    },
    [persist],
  );
  const save = useCallback(async () => {
    while (pending.current) await pending.current;
    if (conflict.current)
      throw new Error(
        "A newer draft exists. Reload this page and restore your browser draft after reviewing the saved answers.",
      );
    if (!dirty.current) return;
    const snapshot = current.current;
    const operation = (async () => {
      setStatus("Saving…");
      setError("");
      try {
        const result = await command<Attempt>(homeworkId, {
          action: "answers",
          attemptId: initial.id,
          version: version.current,
          answers: snapshot,
        });
        version.current = result.version;
        dirty.current = current.current !== snapshot;
        if (dirty.current) persist();
        else {
          try {
            localStorage.removeItem(key);
          } catch {
            /* Browser storage cleanup is best effort; server work remains intact. */
          }
        }
        if (mounted.current)
          setStatus(
            dirty.current ? "Changes waiting to save" : "All changes saved",
          );
      } catch (e) {
        if (e instanceof HomeworkRequestError && e.status === 409)
          conflict.current = true;
        persist();
        if (mounted.current) {
          setError((e as Error).message);
          setStatus("Not saved · your browser draft is kept");
        }
        throw e;
      }
    })();
    pending.current = operation;
    try {
      await operation;
    } finally {
      pending.current = null;
    }
  }, [homeworkId, initial.id, key, persist]);
  useEffect(() => {
    if (!dirty.current || conflict.current || recovery) return;
    const timer = setTimeout(() => {
      void save().catch(() => {
        /* The save path displays errors and retains the browser draft. */
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [answers, save, recovery]);
  async function flush() {
    await save();
    if (dirty.current) await save();
    if (dirty.current) throw new Error("Wait for your latest changes to save.");
    return version.current;
  }
  function acceptServer(result: Attempt) {
    version.current = result.version;
    current.current = result.answers;
    dirty.current = false;
    setAnswers(result.answers);
    setStatus("All changes saved");
    try {
      localStorage.removeItem(key);
    } catch {
      /* Browser storage cleanup is best effort; server work remains intact. */
    }
  }
  return {
    answers,
    status,
    error,
    recovery,
    change,
    flush,
    acceptServer,
    restore: () => {
      if (recovery) {
        change(recovery);
        setRecovery(null);
      }
    },
    discard: () => {
      setRecovery(null);
      try {
        localStorage.removeItem(key);
      } catch {
        /* Browser storage cleanup is best effort; server work remains intact. */
      }
    },
    clear: () => {
      dirty.current = false;
      try {
        localStorage.removeItem(key);
      } catch {
        /* Browser storage cleanup is best effort; server work remains intact. */
      }
    },
  };
}
