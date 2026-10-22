import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, { code: string; message: string }>,
  clientError: null as Error | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase.server", () => ({
  createServerSupabase: () => {
    if (state.clientError) throw state.clientError;
    return createClient("https://homework-policy.invalid", "unit-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetchDatabase },
    });
  },
}));
import { editableHomeworkForUser, homeworkAiLockForUser } from "../ai-policy-server";

function filterRows(rows: Row[], query: URLSearchParams) {
  return rows.filter((row) =>
    [...query].every(([field, expression]) => {
      if (field === "select" || field.includes(".")) return true;
      if (expression.startsWith("eq.")) return String(row[field]) === expression.slice(3);
      if (expression === "is.null") return row[field] === null;
      if (expression.startsWith("in.("))
        return expression.slice(4, -1).split(",").includes(String(row[field]));
      throw new Error("Unexpected database filter");
    }),
  );
}

async function fetchDatabase(input: RequestInfo | URL) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const table = url.pathname.split("/").pop()!;
  const error = state.errors[table];
  if (error) return Response.json(error, { status: 500 });
  const select = url.searchParams.get("select") ?? "";
  const relationships: Record<string, Record<string, string>> = {
    homework_attempts: { homework_recipients: "homework_recipients" },
    homework_recipients: { homeworks: "homeworks" },
  };
  let parent = table;
  for (const [, relation] of select.matchAll(/([a-z_]+)!inner\(/g)) {
    const target = relationships[parent]?.[relation];
    if (!target)
      return Response.json({
        code: "PGRST200",
        message: "Could not find a relationship between " + parent + " and " + relation,
      }, { status: 400 });
    parent = target;
  }
  for (const [field, expression] of url.searchParams) {
    if (!field.includes(".")) continue;
    const path = field.split(".");
    const column = path.pop();
    let filterParent = table;
    for (const relation of path) {
      const target = relationships[filterParent]?.[relation];
      if (!target)
        return Response.json({
          code: "PGRST200",
          message: "Unknown embedded filter relationship " + field,
        }, { status: 400 });
      filterParent = target;
    }
    if (filterParent !== "homeworks" || column !== "status")
      return Response.json({ code: "PGRST204", message: "Unknown embedded filter column" }, { status: 400 });
    if (!expression.startsWith("eq."))
      return Response.json({ code: "PGRST100", message: "Unsupported embedded filter" }, { status: 400 });
  }

  let rows = filterRows(state.tables[table] ?? [], url.searchParams);
  if (table === "homework_attempts") {
    rows = rows.flatMap<Row>((attempt) => {
      const recipient = state.tables.homework_recipients.find((row) =>
        row.homework_id === attempt.homework_id && row.student_id === attempt.student_id,
      );
      if (!recipient) return select.includes("homework_recipients!inner(") ? [] : [{ ...attempt, homework_recipients: null }];
      const homework = state.tables.homeworks.find((row) => row.id === recipient.homework_id);
      const status = url.searchParams.get("homework_recipients.homeworks.status");
      const included = homework && (!status || status === "eq." + homework.status);
      if (!included && select.includes("homeworks!inner(")) return [];
      return [{
        homework_id: attempt.homework_id,
        submitted_at: attempt.submitted_at,
        revision_due_at: attempt.revision_due_at,
        homework_recipients: { homeworks: included ? homework : null },
      }];
    });
  }
  return Response.json(rows);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  state.clientError = null;
  state.errors = {};
  state.tables = {
    homework_attempts: [{
      homework_id: "homework-1", student_id: "student-1",
      submitted_at: null, revision_due_at: null,
    }],
    homework_recipients: [{
      homework_id: "homework-1", student_id: "student-1", extension_at: null,
    }],
    homeworks: [{
      id: "homework-1", organization_id: "school-1", status: "published",
      due_at: "2026-10-14T12:00:00Z", close_at: null, accept_late: false,
    }],
    organization_members: [{
      user_id: "student-1", organization_id: "school-1", is_active: true,
    }],
  };
});
afterEach(() => vi.useRealTimers());

describe("homework policy lookup with the deployed foreign-key path", () => {
  it("finds an editable attempt through its recipient and homework", async () => {
    await expect(editableHomeworkForUser("student-1")).resolves.toMatchObject({
      homework_id: "homework-1",
      submitted_at: null,
      revision_due_at: null,
      homework_recipients: { homeworks: { organization_id: "school-1", status: "published" } },
    });
  });

  it("returns null when no unsubmitted attempt exists", async () => {
    state.tables.homework_attempts = [];
    await expect(editableHomeworkForUser("student-1")).resolves.toBeNull();
  });

  it.each(["draft", "archived"])("ignores %s homework", async (status) => {
    state.tables.homeworks[0].status = status;
    await expect(editableHomeworkForUser("student-1")).resolves.toBeNull();
  });

  it("skips unpublished homework when another editable assignment exists", async () => {
    state.tables.homeworks[0].status = "draft";
    state.tables.homeworks.push({ ...state.tables.homeworks[0], id: "homework-2", status: "published" });
    state.tables.homework_attempts.push({ ...state.tables.homework_attempts[0], homework_id: "homework-2" });
    state.tables.homework_recipients.push({ ...state.tables.homework_recipients[0], homework_id: "homework-2" });
    await expect(editableHomeworkForUser("student-1")).resolves.toMatchObject({ homework_id: "homework-2" });
  });


  it("ignores another student's attempt", async () => {
    state.tables.homework_attempts[0].student_id = "student-2";
    state.tables.homework_recipients.push({
      homework_id: "homework-1", student_id: "student-2", extension_at: null,
    });
    await expect(editableHomeworkForUser("student-1")).resolves.toBeNull();
  });

  it("ignores submitted attempts", async () => {
    state.tables.homework_attempts[0].submitted_at = "2026-10-13T11:00:00Z";
    await expect(editableHomeworkForUser("student-1")).resolves.toBeNull();
  });

  it("requires active membership in the homework organization", async () => {
    state.tables.organization_members[0].is_active = false;
    await expect(editableHomeworkForUser("student-1")).resolves.toBeNull();
  });

  it("rejects membership in a different organization", async () => {
    state.tables.organization_members[0].organization_id = "school-2";
    await expect(editableHomeworkForUser("student-1")).resolves.toBeNull();
  });

  it("rejects another user's membership", async () => {
    state.tables.organization_members[0].user_id = "student-2";
    await expect(editableHomeworkForUser("student-1")).resolves.toBeNull();
  });

  it("rejects overdue homework when late work is disabled", async () => {
    state.tables.homeworks[0].due_at = "2026-10-12T12:00:00Z";
    await expect(editableHomeworkForUser("student-1")).resolves.toBeNull();
  });

  it("stops pausing AI tools once the homework is due, even when late work is accepted", async () => {
    state.tables.homeworks[0].due_at = "2026-10-12T12:00:00Z";
    state.tables.homeworks[0].accept_late = true;
    await expect(editableHomeworkForUser("student-1")).resolves.toBeNull();
  });

  it("returns the homework title for the student's banner", async () => {
    state.tables.homeworks[0].title = "Forces check-in";
    await expect(editableHomeworkForUser("student-1")).resolves.toMatchObject({
      homework_recipients: { homeworks: { id: "homework-1", title: "Forces check-in" } },
    });
  });

  it("rejects homework after its closing time", async () => {
    state.tables.homeworks[0].due_at = "2026-10-12T10:00:00Z";
    state.tables.homeworks[0].close_at = "2026-10-12T12:00:00Z";
    state.tables.homeworks[0].accept_late = true;
    await expect(editableHomeworkForUser("student-1")).resolves.toBeNull();
  });

  it("uses the student's extension for an overdue attempt", async () => {
    state.tables.homeworks[0].due_at = "2026-10-12T12:00:00Z";
    state.tables.homework_recipients[0].extension_at = "2026-10-14T12:00:00Z";
    await expect(editableHomeworkForUser("student-1")).resolves.toMatchObject({ homework_id: "homework-1" });
  });

  it("reports the student's extension as the end of the pause", async () => {
    state.tables.homeworks[0].due_at = "2026-10-12T12:00:00Z";
    state.tables.homework_recipients[0].extension_at = "2026-10-14T12:00:00Z";
    await expect(homeworkAiLockForUser("student-1")).resolves.toMatchObject({
      homeworkId: "homework-1",
      dueAt: "2026-10-14T12:00:00Z",
    });
  });

  it("does not use another student's extension", async () => {
    state.tables.homeworks[0].due_at = "2026-10-12T12:00:00Z";
    state.tables.homework_recipients.unshift({
      homework_id: "homework-1", student_id: "student-2", extension_at: "2026-10-14T12:00:00Z",
    });
    await expect(editableHomeworkForUser("student-1")).resolves.toBeNull();
  });

  it("lets the revision deadline extend the closing time", async () => {
    state.tables.homeworks[0].due_at = "2026-10-12T10:00:00Z";
    state.tables.homeworks[0].close_at = "2026-10-12T12:00:00Z";
    state.tables.homework_attempts[0].revision_due_at = "2026-10-14T12:00:00Z";
    await expect(editableHomeworkForUser("student-1")).resolves.toMatchObject({ homework_id: "homework-1" });
  });

  it.each(["homework_attempts", "organization_members", "homework_recipients"])(
    "propagates %s query errors to the fail-closed proxy",
    async (table) => {
      state.errors[table] = { code: "XX000", message: table + " unavailable" };
      await expect(editableHomeworkForUser("student-1")).rejects.toMatchObject(state.errors[table]);
    },
  );

  it("still propagates membership errors when there are no attempts", async () => {
    state.tables.homework_attempts = [];
    state.errors.organization_members = { code: "XX000", message: "Membership unavailable" };
    await expect(editableHomeworkForUser("student-1")).rejects.toMatchObject(state.errors.organization_members);
  });

  it("propagates database client initialization failures", async () => {
    state.clientError = new Error("Database client unavailable");
    await expect(editableHomeworkForUser("student-1")).rejects.toBe(state.clientError);
  });
});
