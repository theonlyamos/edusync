"use client";
import Link from "next/link";
import { BookOpen, Target, UserRoundSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardEmpty, DashboardSection } from "./DashboardParts";
import type { DashboardRequest } from "./StudentInsights";
import type { TeacherDashboardData } from "@/lib/dashboard-server";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function StudentsBehindSection({
  request,
}: {
  request: DashboardRequest<TeacherDashboardData>;
}) {
  const items = request.data?.studentsFallingBehind ?? [];
  return (
    <DashboardSection
      title="Students who may need support"
      icon={<UserRoundSearch className="h-5 w-5 text-primary" />}
      loading={request.loading}
      error={request.error}
      retry={request.refresh}
    >
      {items.length === 0 ? (
        <DashboardEmpty>
          No one is behind. Students with overdue or late homework, or a released score under 50%, will show up here.
        </DashboardEmpty>
      ) : (
        <ul className="divide-y">
          {items.map((s) => (
            <li key={s.studentId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium break-words">{s.name}</p>
                <p className="text-sm text-muted-foreground break-words">
                  {[
                    s.missed ? `${s.missed} overdue` : null,
                    s.late ? `${s.late} late` : null,
                    s.lowScores ? `${plural(s.lowScores, "low score")}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button size="sm" variant="outline" className="min-h-11 shrink-0 xl:min-h-0" asChild>
                <Link href={`/teachers/homework/${s.latestHomeworkId}`} title={s.latestHomeworkTitle}>
                  View homework
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  );
}

export function WeakObjectivesSection({
  request,
}: {
  request: DashboardRequest<TeacherDashboardData>;
}) {
  const items = request.data?.weakestObjectives ?? [];
  return (
    <DashboardSection
      title="Objectives to revisit"
      icon={<Target className="h-5 w-5 text-primary" />}
      loading={request.loading}
      error={request.error}
      retry={request.refresh}
    >
      {items.length === 0 ? (
        <DashboardEmpty>
          Nothing below 70% in your marked homework. Objectives where the class scores lower will show up here.
        </DashboardEmpty>
      ) : (
        <ul className="divide-y">
          {items.map((o) => (
            <li key={`${o.homeworkId}-${o.objectiveId}`} className="py-3">
              <Link href={`/teachers/homework/${o.homeworkId}/insights`} className="block rounded-md hover:bg-muted/50">
                <div className="flex justify-between gap-3">
                  <p className="min-w-0 font-medium break-words">{o.objectiveText}</p>
                  <span className="shrink-0 font-medium">{o.percentage}%</span>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded bg-muted"
                  role="meter"
                  aria-label={o.objectiveText}
                  aria-valuenow={o.percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full bg-primary" style={{ width: `${o.percentage}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground break-words">
                  {o.homeworkTitle} · {plural(o.submissions, "marked submission")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  );
}

export function LessonPipelineSection({
  request,
}: {
  request: DashboardRequest<TeacherDashboardData>;
}) {
  const lessons = request.data?.lessons;
  return (
    <DashboardSection
      title="Your lessons"
      icon={<BookOpen className="h-5 w-5 text-primary" />}
      href="/teachers/lessons"
      loading={request.loading}
      error={request.error}
      retry={request.refresh}
    >
      {!lessons || lessons.published + lessons.unpublished === 0 ? (
        <DashboardEmpty>You haven&apos;t created a lesson yet.</DashboardEmpty>
      ) : (
        <>
          <p className="text-sm">
            {plural(lessons.published, "published lesson")}
            {lessons.unpublished ? ` · ${lessons.unpublished} not published yet` : ""}
          </p>
          {lessons.toReview.length > 0 ? (
            <ul className="mt-3 divide-y">
              {lessons.toReview.map((l) => (
                <li key={l.lessonId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{l.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {plural(l.drafts, "visual")} waiting for your review
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="min-h-11 shrink-0 xl:min-h-0" asChild>
                    <Link href={`/teachers/lessons/${l.lessonId}`}>Review</Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No visuals waiting for review.</p>
          )}
        </>
      )}
    </DashboardSection>
  );
}
