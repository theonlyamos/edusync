"use client";
import Link from "next/link";
import {
  BookOpenCheck,
  Brain,
  History,
  MessagesSquare,
  NotebookPen,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardEmpty, DashboardSection } from "./DashboardParts";
import { formatWhen } from "@/lib/dashboard";
import type { ActivityItem, ActivityKind } from "@/lib/dashboard-insights";
import type { StudentDashboardData } from "@/lib/dashboard-server";

export interface DashboardRequest<T> {
  data: T | null;
  loading: boolean;
  error: string;
  refresh: () => void;
}

function resumeHref(item: StudentDashboardData["continueLearning"][number]) {
  if (item.mode === "companion") return `/students/lessons/${item.lessonId}`;
  const params = new URLSearchParams({ lessonId: item.lessonId });
  if (item.objectiveId) params.set("objectiveId", item.objectiveId);
  return `/students/learn?${params}`;
}

export function ContinueLearningSection({
  request,
  now,
}: {
  request: DashboardRequest<StudentDashboardData>;
  now: Date;
}) {
  const items = request.data?.continueLearning ?? [],
    mastered = request.data?.objectivesMastered ?? 0;
  return (
    <DashboardSection
      title="Continue learning"
      icon={<Sparkles className="h-5 w-5 text-primary" />}
      href="/students/lessons"
      linkLabel="All lessons"
      loading={request.loading}
      error={request.error}
      retry={request.refresh}
    >
      {items.length === 0 ? (
        <DashboardEmpty>
          Open a lesson to learn with the AI tutor. Your progress will show up here.
        </DashboardEmpty>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.runId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{item.lessonTitle}</p>
                <p className="text-sm text-muted-foreground break-words">
                  {item.objectiveText ? `Next: ${item.objectiveText}` : item.subject}
                  {" · "}
                  {formatWhen(item.updatedAt, now)}
                </p>
                {item.progress.total > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="h-2 flex-1 overflow-hidden rounded bg-muted"
                      role="meter"
                      aria-label={`${item.lessonTitle} objectives mastered`}
                      aria-valuenow={item.progress.mastered}
                      aria-valuemin={0}
                      aria-valuemax={item.progress.total}
                    >
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${item.progress.percentage ?? 0}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.progress.mastered}/{item.progress.total} objectives
                    </span>
                  </div>
                )}
              </div>
              <Button size="sm" variant="outline" className="min-h-11 shrink-0 xl:min-h-0" asChild>
                <Link href={resumeHref(item)}>Resume</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {mastered > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {mastered} objective{mastered === 1 ? "" : "s"} mastered so far.
        </p>
      )}
    </DashboardSection>
  );
}

const ACTIVITY: Record<ActivityKind, { label: string; icon: React.ReactNode }> = {
  feedback_released: {
    label: "Feedback ready",
    icon: <NotebookPen className="h-4 w-4 text-primary" />,
  },
  homework_submitted: {
    label: "Homework submitted",
    icon: <Send className="h-4 w-4 text-primary" />,
  },
  objective_mastered: {
    label: "Objective mastered",
    icon: <BookOpenCheck className="h-4 w-4 text-primary" />,
  },
  practice_completed: {
    label: "Practice",
    icon: <Brain className="h-4 w-4 text-secondary" />,
  },
  tutor_session: {
    label: "Tutor session",
    icon: <MessagesSquare className="h-4 w-4 text-accent" />,
  },
};

function ActivityRow({ item, now }: { item: ActivityItem; now: Date }) {
  const meta = ACTIVITY[item.kind];
  const body = (
    <>
      <div className="shrink-0 rounded-full bg-muted p-2">{meta.icon}</div>
      <div className="min-w-0">
        <p className="font-medium break-words">{item.title}</p>
        <p className="text-sm text-muted-foreground break-words">
          {[meta.label, item.detail, formatWhen(item.at, now)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </>
  );
  return item.href ? (
    <Link href={item.href} className="flex items-start gap-3 rounded-md py-3 hover:bg-muted/50">
      {body}
    </Link>
  ) : (
    <div className="flex items-start gap-3 py-3">{body}</div>
  );
}

export function RecentActivitySection({
  request,
  now,
}: {
  request: DashboardRequest<StudentDashboardData>;
  now: Date;
}) {
  const items = request.data?.activity ?? [];
  return (
    <DashboardSection
      title="Recent activity"
      icon={<History className="h-5 w-5 text-primary" />}
      loading={request.loading}
      error={request.error}
      retry={request.refresh}
    >
      {items.length === 0 ? (
        <DashboardEmpty>
          Nothing yet. Lessons, homework, practice and tutor sessions will show up here.
        </DashboardEmpty>
      ) : (
        <ul className="divide-y">
          {items.map((item, i) => (
            <li key={`${item.kind}-${item.at}-${i}`}>
              <ActivityRow item={item} now={now} />
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  );
}
