import { it, expect } from "vitest";
import { attemptIsEditable, type Homework, type Attempt } from "../domain";
const now = Date.parse("2026-10-09T12:00:00Z");
const h = {
  status: "published",
  accept_late: false,
  due_at: "2026-10-09T11:00:00Z",
  close_at: "2026-10-09T11:30:00Z",
} as Homework;
const a = { submitted_at: null, revision_due_at: null } as Attempt;
it("opens only editable attempts and gives explicit extensions precedence", () => {
  expect(attemptIsEditable(h, a, null, now)).toBe(false);
  expect(attemptIsEditable(h, a, "2026-10-09T13:00:00Z", now)).toBe(true);
  expect(
    attemptIsEditable(
      h,
      { ...a, revision_due_at: "2026-10-09T14:00:00Z" },
      null,
      now,
    ),
  ).toBe(true);
  expect(
    attemptIsEditable(
      h,
      { ...a, submitted_at: "2026-10-09T10:00:00Z" },
      null,
      now,
    ),
  ).toBe(false);
  expect(
    attemptIsEditable(
      { ...h, status: "archived" },
      a,
      "2026-10-09T13:00:00Z",
      now,
    ),
  ).toBe(false);
  expect(
    attemptIsEditable(
      { ...h, accept_late: true, close_at: null },
      a,
      null,
      now,
    ),
  ).toBe(true);
});
