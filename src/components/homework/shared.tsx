"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, NotebookPen, FileText } from "lucide-react";
import type {
  Question,
  Attachment,
  Answers,
  Homework,
  Attempt,
} from "@/lib/homework/domain";
export class HomeworkRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function homeworkRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers:
      options?.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json().catch(() => {
    throw new HomeworkRequestError(
      502,
      "The response was interrupted. Retry without closing your work.",
    );
  });
  if (!response.ok)
    throw new HomeworkRequestError(
      response.status,
      data?.error ?? "Homework request failed",
    );
  return data as T;
}
export function useHomeworkClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function useHomeworkLeaveWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const follow = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      const target = new URL(link.href);
      if (
        target.origin === location.origin &&
        target.pathname === location.pathname &&
        target.search === location.search
      )
        return;
      if (
        !window.confirm(
          "Discard unsaved homework changes? Save the draft first to keep them.",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", follow, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", follow, true);
    };
  }, [dirty]);
}
export const command = <T,>(id: string, body: unknown) =>
  homeworkRequest<T>(`/api/homework/${id}/actions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
export function useHomeworkData<T>(url: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await homeworkRequest<T>(url));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setData(null);
    homeworkRequest<T>(url)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [url]);
  return { data, error, loading, refresh, setData };
}
export function HomeworkHeader({
  title,
  description,
  actions,
  eyebrow = "Homework",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 mb-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">
          {eyebrow}
        </p>
        <h1 className="text-3xl sm:text-4xl font-medium mb-2">{title}</h1>
        {description && (
          <p className="text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">{actions}</div>
    </header>
  );
}
export function HomeworkPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border bg-card text-card-foreground p-5 sm:p-6 min-w-0 ${className}`}
    >
      {children}
    </section>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium mb-4">
      {label}
      {children}
    </label>
  );
}
export const fieldClass = "input-field w-full min-w-0";
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : undefined}
      className={`border-l-4 rounded-r-md px-4 py-3 text-sm my-4 ${error ? "border-destructive bg-destructive/10" : "border-primary bg-primary/10"}`}
    >
      {children}
    </div>
  );
}
export function DataState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (error)
    return (
      <Notice error>
        <p>{error}</p>
        <Button variant="outline" className="mt-3" onClick={retry}>
          Try again
        </Button>
      </Notice>
    );
  if (loading)
    return (
      <div role="status" className="flex items-center gap-3 py-10">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading homework…
      </div>
    );
  return null;
}
export function EmptyHomework({ teacher = false }: { teacher?: boolean }) {
  return (
    <HomeworkPanel>
      <div className="text-center py-12 grid justify-items-center gap-4">
        <NotebookPen className="h-9 w-9 text-primary" />
        <h2 className="text-2xl">A fresh page.</h2>
        <p className="text-muted-foreground">
          {teacher
            ? "Create homework from a published lesson."
            : "Your assigned homework will appear here."}
        </p>
        <Button asChild>
          <Link href={teacher ? "/teachers/homework/new" : "/students/lessons"}>
            {teacher ? "Create homework" : "Explore lessons"}
          </Link>
        </Button>
      </div>
    </HomeworkPanel>
  );
}
export function formatHomeworkDate(
  value: string | null | undefined,
  timezone = "UTC",
) {
  if (!value) return "No deadline";
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value)) +
    " · " +
    timezone
  );
}
export function utcInput(value: string) {
  return new Date(value).toISOString().slice(0, 16);
}
export function utcValue(value: string) {
  return new Date(value + ":00Z").toISOString();
}
export function homeworkDue(
  h: Homework,
  a?: Attempt | null,
  extension?: string | null,
) {
  return a?.revision_due_at ?? extension ?? h.due_at;
}
export function StatRow({
  items,
}: {
  items: { label: string; value: string | number; detail?: string }[];
}) {
  return (
    <div className="grid grid-cols-3 gap-3 border-y py-5 mb-6">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <p className="text-xs text-muted-foreground">{i.label}</p>
          <p className="text-2xl sm:text-3xl font-medium font-serif my-1">
            {i.value}
          </p>
          {i.detail && (
            <p className="text-xs text-muted-foreground">{i.detail}</p>
          )}
        </div>
      ))}
    </div>
  );
}
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  children,
  onConfirm,
  busy,
  label = "Confirm",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  children?: ReactNode;
  onConfirm: () => void;
  busy?: boolean;
  label?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <div className="flex gap-2 justify-end flex-wrap">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={busy} onClick={onConfirm}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {label}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function AttachmentButton({
  file,
  homeworkId,
}: {
  file: Attachment;
  homeworkId: string;
}) {
  const [preview, setPreview] = useState<{
      url: string;
      mimeType: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        className="max-w-full h-auto py-2 whitespace-normal break-all text-left"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setPreview(
              await homeworkRequest(
                `/api/homework/${homeworkId}/attachments?attachmentId=${file.id}`,
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <FileText className="h-4 w-4 shrink-0 mr-2" />
        {file.filename}
      </Button>
      {error && <Notice error>{error}</Notice>}
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(v) => {
          if (!v) setPreview(null);
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="break-all">{file.filename}</DialogTitle>
            <DialogDescription>
              Private homework attachment · Link expires in one minute.
            </DialogDescription>
          </DialogHeader>
          {preview &&
            (preview.mimeType.startsWith("image/") ? (
              <img
                src={preview.url}
                alt={`Submitted work: ${file.filename}`}
                className="max-h-[65dvh] object-contain mx-auto"
              />
            ) : preview.mimeType === "application/pdf" ? (
              <iframe
                title={file.filename}
                src={preview.url}
                className="w-full h-[60dvh] border"
              />
            ) : (
              <a
                href={preview.url}
                rel="noopener noreferrer"
                target="_blank"
                className="text-primary underline"
              >
                Download Word document
              </a>
            ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function QuestionResponse({
  question,
  value,
  onChange,
  readOnly = false,
  attachments = [],
  homeworkId,
  onUpload,
  onRemove,
  uploading = false,
}: {
  question: Question;
  value?: Answers[string];
  onChange?: (v: Answers[string]) => void;
  readOnly?: boolean;
  attachments?: Attachment[];
  homeworkId?: string;
  onUpload?: (file: File) => void;
  onRemove?: (file: Attachment) => void;
  uploading?: boolean;
}) {
  const files = Array.isArray(value)
    ? attachments.filter((a) => value.includes(a.id))
    : [];
  return (
    <div className="space-y-4">
      <div className="flex gap-3 justify-between">
        <h2 className="text-xl sm:text-2xl">{question.prompt}</h2>
        <Badge variant="secondary" className="shrink-0 self-start">
          {question.points} marks
        </Badge>
      </div>
      {question.rubric.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Criteria:{" "}
          {question.rubric.map((r) => `${r.label} (${r.points})`).join(" · ")}
        </p>
      )}
      {question.type === "file" ? (
        <div className="space-y-3">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex flex-wrap gap-2 items-center justify-between"
            >
              {homeworkId ? (
                <AttachmentButton file={file} homeworkId={homeworkId} />
              ) : (
                <span>{file.filename}</span>
              )}
              {!readOnly && onRemove && (
                <Button
                  disabled={uploading}
                  variant="ghost"
                  onClick={() => onRemove(file)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {!readOnly && onUpload && (
            <label className="grid gap-3 p-5 border border-dashed rounded-lg bg-muted/30 text-sm">
              Upload your work
              <span className="text-xs text-muted-foreground">
                PDF, JPG, PNG or DOCX · 10 MB maximum · 3 files
              </span>
              <input
                aria-label="Choose homework attachment"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                disabled={uploading || files.length >= 3}
                className="max-w-full"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUpload(file);
                  e.target.value = "";
                }}
              />
              {uploading && <span role="status">Uploading…</span>}
            </label>
          )}
          {readOnly && !files.length && (
            <p className="text-muted-foreground">No attachment submitted</p>
          )}
        </div>
      ) : ["multiple_choice", "multiple_select", "true_false"].includes(
          question.type,
        ) ? (
        <fieldset className="space-y-2">
          <legend className="sr-only">{question.prompt}</legend>
          <p className="text-sm text-muted-foreground">
            {question.type === "multiple_select"
              ? "Select all that apply."
              : "Choose one answer."}
          </p>
          {question.options.map((option) => (
            <label
              key={option}
              className={`flex gap-3 p-3 border rounded-md text-sm ${(Array.isArray(value) ? value.includes(option) : value === option) ? "bg-primary/10 border-primary" : ""}`}
            >
              <input
                type={
                  question.type === "multiple_select" ? "checkbox" : "radio"
                }
                name={question.id}
                value={option}
                checked={
                  Array.isArray(value)
                    ? value.includes(option)
                    : value === option
                }
                disabled={readOnly}
                onChange={() => {
                  if (question.type !== "multiple_select") onChange?.(option);
                  else {
                    const selected = Array.isArray(value) ? value : [];
                    onChange?.(
                      selected.includes(option)
                        ? selected.filter((item) => item !== option)
                        : [...selected, option],
                    );
                  }
                }}
                className="accent-primary"
              />
              {option}
            </label>
          ))}
        </fieldset>
      ) : (
        <Field label={readOnly ? "Submitted response" : "Your answer"}>
          <textarea
            className={`${fieldClass} h-auto min-h-36 resize-y text-base`}
            readOnly={readOnly}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange?.(e.target.value)}
            maxLength={30000}
          />
        </Field>
      )}
    </div>
  );
}
