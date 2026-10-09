import { beforeEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({
  role: "student",
  id: "11111111-1111-4111-8111-111111111111",
  homework: {} as Record<string, unknown>,
  member: true,
  recipient: true,
  list: false,
  tables: {} as Record<string, unknown>,
  calls: [] as string[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  getServerSession: async () =>
    state.role ? { user: { id: state.id, role: state.role } } : null,
}));
vi.mock("@/lib/supabase.server", () => ({
  createServerSupabase: () => ({
    rpc: async (_name: string, params: { p_payload: unknown }) => ({
      data: params.p_payload,
      error: null,
    }),
    from: (table: string) => {
      state.calls.push(table);
      const value =
        table === "homeworks"
          ? state.list
            ? (state.tables.homeworks ?? [state.homework])
            : state.homework
          : table === "organization_members"
            ? (state.tables.organization_members ??
              (state.member ? [{ organization_id: "school" }] : null))
            : table === "homework_recipients"
              ? state.recipient
                ? [
                    {
                      student_id: state.id,
                      homework_id: state.homework.id,
                      extension_at: null,
                    },
                  ]
                : []
              : (state.tables[table] ?? []);
      const result = { data: value, error: null };
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        not: () => chain,
        neq: () => chain,
        order: () => chain,
        limit: () => chain,
        range: () => chain,
        maybeSingle: async () => ({
          ...result,
          data: Array.isArray(value) ? (value[0] ?? null) : value,
        }),
        single: async () => ({
          ...result,
          data: Array.isArray(value) ? (value[0] ?? null) : value,
        }),
        then: (resolve: (value: typeof result) => unknown) =>
          Promise.resolve(result).then(resolve),
      };
      return chain;
    },
  }),
}));
import {
  requireHomework,
  requireHomeworkUser,
  homeworkDetail,
  homeworkError,
} from "../server";
import { GET as performance } from "@/app/api/homework/performance/route";
import { GET as listHomework } from "@/app/api/homework/route";
import { homeworkAction } from "../operations";
beforeEach(() => {
  state.role = "student";
  state.member = true;
  state.recipient = true;
  state.list = false;
  state.calls = [];
  state.homework = {
    id: "22222222-2222-4222-8222-222222222222",
    owner_id: "33333333-3333-4333-8333-333333333333",
    organization_id: "school",
    status: "published",
    questions: [],
  };
  state.tables = {
    users: [{ id: state.id, name: "Student" }],
    homework_attempts: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        student_id: state.id,
        answers: { q: "Own work" },
      },
    ],
    homework_grades: [
      {
        attempt_id: "44444444-4444-4444-8444-444444444444",
        version: 2,
        marks: { q: { score: 9, feedback: "Private correction" } },
        feedback: "Private",
        released_marks: { q: { score: 4, feedback: "Released" } },
        released_feedback: "Public feedback",
        released_at: "2026-10-09T12:00:00Z",
      },
    ],
  };
});
describe("homework server trust boundary", () => {
  it("requires a reason when a teacher gives partial credit for multiple-answer work", async () => {
    state.role = "teacher";
    state.homework.owner_id = state.id;
    state.homework.questions = [
      {
        id: "q",
        type: "multiple_select",
        prompt: "Forces?",
        points: 4,
        options: ["Gravity", "Friction", "Speed"],
        rubric: [],
      },
    ];
    const attempt = "44444444-4444-4444-8444-444444444444";
    state.tables.homework_attempts = [
      {
        id: attempt,
        answers: { q: ["Gravity"] },
        submitted_at: "2026-10-09T12:00:00Z",
      },
    ];
    state.tables.homework_keys = [
      {
        keys: {
          q: {
            correctAnswer: ["Gravity", "Friction"],
            guidance: "Both forces",
          },
        },
      },
    ];
    const body = {
      action: "grade",
      attemptId: attempt,
      version: 0,
      marks: { q: { score: 2 } },
      feedback: "Partial credit",
    };
    await expect(
      homeworkAction(String(state.homework.id), body),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("Explain overrides"),
    });
    await expect(
      homeworkAction(String(state.homework.id), {
        ...body,
        marks: {
          q: { score: 2, overrideReason: "Identified one force correctly" },
        },
      }),
    ).resolves.toMatchObject({ marks: { q: { score: 2 } } });
  });
  it("checks school access together when listing homework across schools", async () => {
    state.role = "teacher";
    state.list = true;
    state.tables.homeworks = ["school", "second", "inactive"].map((org) => ({
      ...state.homework,
      id: org,
      organization_id: org,
      owner_id: state.id,
    }));
    state.tables.organization_members = [
      { organization_id: "school" },
      { organization_id: "second" },
    ];
    const response = await listHomework(
      new Request("https://example.test/api/homework"),
    );
    expect(response.status).toBe(200);
    expect(
      (await response.json()).items.map(
        (item: { homework: { id: string } }) => item.homework.id,
      ),
    ).toEqual(["school", "second"]);
    expect(
      state.calls.filter((table) => table === "organization_members"),
    ).toHaveLength(1);
  });
  it("keeps changed objective revisions separate in released performance", async () => {
    state.tables.homework_attempts = [1, 2, 3].map((n) => ({
      id: `attempt-${n}`,
      student_id: state.id,
      attempt_number: 1,
      late: false,
      homeworks: {
        id: `homework-${n}`,
        lesson_id: "lesson",
        title: "Forces",
        subject: "Science",
        questions: [{ id: "q", points: 4, objectiveId: "objective" }],
        objectives: [
          {
            id: "objective",
            revision: n === 3 ? 2 : 1,
            text: n === 3 ? "Explain force direction" : "Identify forces",
          },
        ],
      },
    }));
    state.tables.homework_grades = [1, 2, 3].map((n) => ({
      attempt_id: `attempt-${n}`,
      released_at: "2026-10-09T12:00:00Z",
      released_marks: { q: { score: n } },
    }));
    const response = await performance();
    expect(response.status).toBe(200);
    expect((await response.json()).objectives).toEqual([
      expect.objectContaining({
        text: "Identify forces",
        earned: 3,
        possible: 8,
        count: 2,
      }),
      expect.objectContaining({
        text: "Explain force direction",
        earned: 3,
        possible: 4,
        count: 1,
      }),
    ]);
  });
  it("keeps an archived unpublished school-less draft accessible to its owner", async () => {
    state.role = "teacher";
    state.homework.owner_id = state.id;
    state.homework.status = "archived";
    state.homework.organization_id = null;
    state.homework.published_at = null;
    state.member = false;
    await expect(
      requireHomework(String(state.homework.id)),
    ).resolves.toHaveProperty("homework.id", state.homework.id);
  });
  it("requires a real session and rejects student management", async () => {
    state.role = "";
    await expect(requireHomeworkUser()).rejects.toMatchObject({ status: 401 });
    state.role = "student";
    await expect(requireHomeworkUser(true)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rejects unassigned, inactive and draft access", async () => {
    state.recipient = false;
    await expect(
      requireHomework(String(state.homework.id)),
    ).rejects.toMatchObject({ status: 403 });
    state.recipient = true;
    state.member = false;
    await expect(
      requireHomework(String(state.homework.id)),
    ).rejects.toMatchObject({ status: 403 });
    state.member = true;
    state.homework.status = "draft";
    await expect(
      requireHomework(String(state.homework.id)),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects another teacher even for a known assignment ID", async () => {
    state.role = "teacher";
    await expect(
      requireHomework(String(state.homework.id)),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("returns only released grade snapshots and never loads keys for students", async () => {
    const result = await homeworkDetail(String(state.homework.id));
    expect(result.keys).toBeUndefined();
    expect(state.calls).not.toContain("homework_keys");
    expect(result.grades[0].marks.q.score).toBe(4);
    expect(result.grades[0].feedback).toBe("Public feedback");
    expect(JSON.stringify(result)).not.toContain("Private correction");
  });
  it("does not expose internal database errors", async () => {
    const response = homeworkError({
      code: "DBFAIL",
      message: "secret table value",
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});
