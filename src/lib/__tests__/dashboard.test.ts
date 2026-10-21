import { describe, expect, it } from "vitest";
import {
  canStillSubmit,
  studentHomeworkTasks,
  teacherHomeworkSummary,
  upcomingLiveClasses,
  type DashboardHomeworkItem,
} from "../dashboard";

const now = new Date("2026-10-21T12:00:00Z");

type ItemOverrides = Omit<Partial<DashboardHomeworkItem>, "homework"> & {
  homework?: Partial<DashboardHomeworkItem["homework"]>;
};

function item(over: ItemOverrides = {}): DashboardHomeworkItem {
  return {
    assigned: 10,
    submitted: 0,
    marked: 0,
    released: 0,
    releasedAt: null,
    myAttempt: null,
    extensionAt: null,
    ...over,
    homework: {
      id: "h1",
      title: "Fractions",
      subject: "Maths",
      lesson_title: "Fractions",
      status: "published",
      due_at: "2026-10-22T12:00:00Z",
      close_at: null,
      accept_late: true,
      timezone: "UTC",
      ...over.homework,
    },
  };
}

describe("studentHomeworkTasks", () => {
  it("lists unsubmitted published homework, soonest first", () => {
    const tasks = studentHomeworkTasks(
      [
        item({ homework: { id: "late", due_at: "2026-10-25T00:00:00Z" } }),
        item({ homework: { id: "soon", due_at: "2026-10-21T18:00:00Z" } }),
        item({ homework: { id: "draft", status: "draft" } }),
        item({
          homework: { id: "done" },
          myAttempt: { submitted_at: "2026-10-20T00:00:00Z", revision_feedback: null, revision_due_at: null },
        }),
      ],
      now,
    );
    expect(tasks.map((t) => t.item.homework.id)).toEqual(["soon", "late"]);
    expect(tasks[0].state).toBe("not_started");
  });

  it("uses the revision deadline and flags revision requests", () => {
    const [t] = studentHomeworkTasks(
      [
        item({
          homework: { due_at: "2026-10-01T00:00:00Z", close_at: "2026-10-02T00:00:00Z" },
          myAttempt: { submitted_at: null, revision_feedback: "Show working", revision_due_at: "2026-10-23T00:00:00Z" },
        }),
      ],
      now,
    );
    expect(t.state).toBe("revision_requested");
    expect(t.dueAt).toBe("2026-10-23T00:00:00Z");
    expect(t.overdue).toBe(false);
  });

  it("keeps overdue work that still accepts late submissions, drops closed work", () => {
    const tasks = studentHomeworkTasks(
      [
        item({ homework: { id: "late-ok", due_at: "2026-10-20T00:00:00Z" } }),
        item({ homework: { id: "no-late", due_at: "2026-10-20T00:00:00Z", accept_late: false } }),
        item({ homework: { id: "closed", due_at: "2026-10-19T00:00:00Z", close_at: "2026-10-20T00:00:00Z" } }),
      ],
      now,
    );
    expect(tasks.map((t) => [t.item.homework.id, t.overdue])).toEqual([["late-ok", true]]);
  });

  it("honours a personal extension", () => {
    expect(
      canStillSubmit(
        item({
          homework: { due_at: "2026-10-20T00:00:00Z", close_at: "2026-10-20T00:00:00Z" },
          extensionAt: "2026-10-22T00:00:00Z",
        }),
        now,
      ),
    ).toBe(true);
  });
});

describe("teacherHomeworkSummary", () => {
  it("counts work to mark and marks waiting for release", () => {
    const s = teacherHomeworkSummary([
      item({ homework: { id: "a" }, submitted: 5, marked: 2, released: 1 }),
      item({ homework: { id: "b" }, submitted: 3, marked: 3, released: 3 }),
      item({ homework: { id: "c", status: "draft" } }),
      item({ homework: { id: "d", status: "archived" }, submitted: 2, marked: 0, released: 0 }),
    ]);
    expect(s).toMatchObject({ needMarking: 5, readyToRelease: 1, open: 2, drafts: 1 });
    expect(s.attention.map((r) => r.item.homework.id)).toEqual(["a", "d"]);
  });
});

describe("upcomingLiveClasses", () => {
  const base = { title: "x", scheduled_start_at: "", scheduled_end_at: "", status: "scheduled", organizer_id: "t1" };
  it("keeps unfinished classes, soonest first, optionally by organizer", () => {
    const list = [
      { ...base, id: "later", scheduled_start_at: "2026-10-23T10:00:00Z", scheduled_end_at: "2026-10-23T11:00:00Z" },
      { ...base, id: "now", status: "live", scheduled_start_at: "2026-10-21T11:30:00Z", scheduled_end_at: "2026-10-21T12:30:00Z" },
      { ...base, id: "past", scheduled_start_at: "2026-10-20T10:00:00Z", scheduled_end_at: "2026-10-20T11:00:00Z" },
      { ...base, id: "cancelled", status: "cancelled", scheduled_start_at: "2026-10-22T10:00:00Z", scheduled_end_at: "2026-10-22T11:00:00Z" },
      { ...base, id: "other", organizer_id: "t2", scheduled_start_at: "2026-10-22T10:00:00Z", scheduled_end_at: "2026-10-22T11:00:00Z" },
    ];
    expect(upcomingLiveClasses(list, now).map((e) => e.id)).toEqual(["now", "other", "later"]);
    expect(upcomingLiveClasses(list, now, { organizerId: "t1" }).map((e) => e.id)).toEqual(["now", "later"]);
  });
});
