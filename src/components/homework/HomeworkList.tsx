"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import type { Homework, Attempt } from "@/lib/homework/domain";
import {
  HomeworkHeader,
  EmptyHomework,
  DataState,
  StatRow,
  useHomeworkData,
  formatHomeworkDate,
  homeworkDue,
} from "./shared";
interface ListItem {
  homework: Homework;
  assigned: number;
  submitted: number;
  marked?: number;
  released: number;
  myAttempt?: Attempt;
  score: number | null;
  releasedAt: string | null;
  extensionAt: string | null;
}
export function HomeworkList({
  teacher = false,
  lessonId,
}: {
  teacher?: boolean;
  lessonId?: string;
}) {
  const [filter, setFilter] = useState("All"),
    [page, setPage] = useState(0),
    { data, error, loading, refresh } = useHomeworkData<{
      items: ListItem[];
      hasMore: boolean;
    }>(
      `/api/homework?page=${page}${lessonId ? "&lessonId=" + encodeURIComponent(lessonId) : ""}`,
    ),
    items = data?.items ?? [];
  const filtered = items.filter(
    (i) =>
      filter === "All" ||
      (filter === "Drafts" && i.homework.status === "draft") ||
      (filter === "Needs marking" && i.submitted > (i.marked ?? 0)) ||
      (filter === "To do" &&
        i.homework.status === "published" &&
        !i.myAttempt?.submitted_at) ||
      (filter === "Feedback" && i.releasedAt) ||
      (filter === "Submitted" && i.myAttempt?.submitted_at),
  );
  const base = teacher ? "/teachers/homework" : "/students/homework";
  return (
    <DashboardLayout>
      <HomeworkHeader
        title={teacher ? "Homework" : "My homework"}
        description={
          teacher
            ? "Turn your lessons into meaningful practice."
            : "Pick up where you left off, or read your latest feedback."
        }
        actions={
          <Button asChild>
            <Link href={teacher ? base + "/new" : base + "/performance"}>
              {teacher ? "Create homework" : "My performance"}
            </Link>
          </Button>
        }
      />
      <DataState loading={loading} error={error} retry={refresh} />
      {data && !error && (
        <>
          {items.length > 0 && (
            <StatRow
              items={
                teacher
                  ? [
                      { label: "Homework on this page", value: items.length },
                      {
                        label: "Need marking",
                        value: items.reduce(
                          (n, i) =>
                            n + Math.max(0, i.submitted - (i.marked ?? 0)),
                          0,
                        ),
                      },
                      {
                        label: "Feedback released",
                        value: items.reduce((n, i) => n + i.released, 0),
                      },
                    ]
                  : [
                      {
                        label: "To work on",
                        value: items.filter(
                          (i) =>
                            i.homework.status === "published" &&
                            !i.myAttempt?.submitted_at,
                        ).length,
                      },
                      {
                        label: "Submitted",
                        value: items.filter((i) => i.myAttempt?.submitted_at)
                          .length,
                      },
                      {
                        label: "Feedback ready",
                        value: items.filter((i) => i.releasedAt).length,
                      },
                    ]
              }
            />
          )}
          <div
            className="flex flex-wrap gap-2 mb-5"
            aria-label="Homework filters"
          >
            {(teacher
              ? ["All", "Needs marking", "Drafts"]
              : ["All", "To do", "Submitted", "Feedback"]
            ).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>
          {!items.length ? (
            <EmptyHomework teacher={teacher} />
          ) : !filtered.length ? (
            <p className="py-10 text-muted-foreground">
              No homework matches this filter.
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((i) => (
                <article
                  key={i.homework.id}
                  className="py-5 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex gap-2 flex-wrap mb-3">
                      <Badge variant="secondary">
                        {i.homework.subject} · {i.homework.grade_level}
                      </Badge>
                      <Badge variant="outline">
                        {teacher
                          ? i.homework.status
                          : i.homework.status === "archived"
                            ? "Archived"
                            : i.myAttempt?.revision_feedback &&
                                !i.myAttempt.submitted_at
                              ? "Revision requested"
                              : i.releasedAt
                                ? "Feedback ready"
                                : i.myAttempt?.submitted_at
                                  ? "Awaiting marking"
                                  : i.myAttempt
                                    ? "In progress"
                                    : "Not started"}
                      </Badge>
                    </div>
                    <h2 className="text-2xl mb-2 break-words">
                      {i.homework.title}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      From {i.homework.lesson_title} · Lesson v
                      {i.homework.publication_version}
                    </p>
                    {teacher && i.homework.status !== "draft" && (
                      <p className="text-sm mt-2">
                        {i.submitted} / {i.assigned} submitted ·{" "}
                        {Math.max(0, i.submitted - (i.marked ?? 0))} need
                        marking
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:items-end gap-3">
                    <p className="text-xs text-muted-foreground">
                      Due{" "}
                      {formatHomeworkDate(
                        homeworkDue(i.homework, i.myAttempt, i.extensionAt),
                        i.homework.timezone,
                      )}
                    </p>
                    {i.score !== null && (
                      <span>
                        {i.score} /{" "}
                        {i.homework.questions.reduce((n, q) => n + q.points, 0)}{" "}
                        marks
                      </span>
                    )}
                    <Button variant="outline" asChild>
                      <Link
                        href={`${base}/${i.homework.id}${teacher && i.homework.status === "draft" ? "/edit" : ""}`}
                      >
                        {teacher && i.homework.status === "draft"
                          ? "Edit draft"
                          : i.releasedAt
                            ? "View feedback"
                            : "Open homework"}
                      </Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="flex justify-between mt-6">
            <Button
              variant="ghost"
              disabled={page === 0 || loading}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous page
            </Button>
            <Button
              variant="ghost"
              disabled={!data.hasMore || loading}
              onClick={() => setPage((n) => n + 1)}
            >
              Next page
            </Button>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
