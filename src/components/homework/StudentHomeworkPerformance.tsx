"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  HomeworkHeader,
  HomeworkPanel,
  StatRow,
  Notice,
  DataState,
  useHomeworkData,
  formatHomeworkDate,
} from "./shared";
interface Performance {
  count: number;
  earned: number;
  possible: number;
  percentage: number | null;
  onTime: number;
  items: {
    homeworkId: string;
    title: string;
    subject: string;
    attempt: number;
    releasedAt: string;
    earned: number;
    possible: number;
    late: boolean;
  }[];
  objectives: {
    id: string;
    text: string;
    earned: number;
    possible: number;
    count: number;
  }[];
}
export function StudentHomeworkPerformance() {
  const api = useHomeworkData<Performance>("/api/homework/performance"),
    data = api.data;
  return (
    <DashboardLayout>
      <HomeworkHeader
        title="See how you’re growing."
        description="Your released homework results, with a clear next step."
        actions={
          <Button variant="outline" asChild>
            <Link href="/students/homework">My homework</Link>
          </Button>
        }
      />
      <DataState loading={api.loading} error={api.error} retry={api.refresh} />
      {data && (
        <>
          <StatRow
            items={[
              {
                label: "Overall score",
                value: data.percentage === null ? "—" : `${data.percentage}%`,
                detail: `${data.earned} / ${data.possible} marks`,
              },
              { label: "Marked homework", value: data.count },
              {
                label: "Submitted on time",
                value: `${data.onTime}/${data.count}`,
              },
            ]}
          />
          <Notice>
            Only released marks count. Each homework uses its latest released
            attempt. The overall score is weighted by available marks.
          </Notice>
          {!data.count ? (
            <HomeworkPanel>
              <h2 className="text-2xl mb-3">Your progress starts here.</h2>
              <p>
                Complete homework and check back after your teacher releases
                feedback.
              </p>
            </HomeworkPanel>
          ) : (
            <>
              <HomeworkPanel>
                <h2 className="text-2xl mb-5">Learning objectives</h2>
                <div className="grid sm:grid-cols-2 gap-6">
                  {data.objectives.map((o) => (
                    <div key={o.id}>
                      <p className="mb-2">{o.text}</p>
                      <div className="h-2 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${(100 * o.earned) / o.possible}%` }}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        {o.earned}/{o.possible} marks · {o.count} homework{" "}
                        {o.count === 1 ? "sample" : "samples"}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-5">
                  Homework scores are evidence from these tasks, rather than a
                  mastery assessment.
                </p>
              </HomeworkPanel>
              <HomeworkPanel className="mt-5">
                <h2 className="text-2xl mb-5">Released results</h2>
                <div className="divide-y">
                  {[...data.items].reverse().map((item) => (
                    <Link
                      key={item.homeworkId}
                      href={`/students/homework/${item.homeworkId}`}
                      className="flex flex-wrap gap-4 justify-between py-4 hover:text-primary"
                    >
                      <div>
                        <h3 className="text-lg">{item.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {item.subject} · Attempt {item.attempt} · Released{" "}
                          {formatHomeworkDate(item.releasedAt)}
                        </p>
                      </div>
                      <span className="font-serif text-2xl">
                        {item.earned}/{item.possible}
                      </span>
                    </Link>
                  ))}
                </div>
              </HomeworkPanel>
            </>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
