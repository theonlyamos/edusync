import { expect, it, vi } from "vitest";
const objective = "11111111-1111-4111-8111-111111111111";
vi.mock("server-only", () => ({}));
vi.mock("../server", () => ({ activeMembership: async () => false }));
vi.mock("@/lib/lesson-artifacts/server", () => ({
  requireLessonManager: async () => ({
    session: { user: { id: "teacher" } },
    lesson: {
      id: "lesson",
      current_publication_id: "publication",
      organization_id: null,
    },
    supabase: {
      from: (table: string) => {
        const data =
          table === "lesson_publications"
            ? {
                id: "publication",
                version: 1,
                manifest: {
                  lesson: {
                    title: "Forces",
                    subject: "Science",
                    gradeLevel: "JHS 1",
                  },
                  objectives: [
                    {
                      id: "11111111-1111-4111-8111-111111111111",
                      revision: 1,
                      text: "Identify forces",
                      artifactIds: ["quiz"],
                    },
                  ],
                },
              }
            : [
                {
                  objective_id: "11111111-1111-4111-8111-111111111111",
                  payload: {
                    questions: [
                      {
                        type: "multiple_select",
                        prompt: "Which are forces?",
                        options: ["Gravity", "Friction", "Speed"],
                        correctAnswer: ["Gravity", "Friction"],
                        points: 4,
                        explanation: "Both are forces",
                      },
                    ],
                  },
                },
              ];
        const result = { data, error: null };
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          single: async () => result,
          then: (resolve: (value: typeof result) => unknown) =>
            Promise.resolve(result).then(resolve),
        };
        return query;
      },
    },
  }),
}));
import { sourceForHomework } from "../sources";
it("imports a published multiple-answer quiz without converting it to written work", async () => {
  const result = await sourceForHomework("lesson");
  expect(result.importedQuestions).toHaveLength(1);
  expect(result.importedQuestions[0]).toMatchObject({
    type: "multiple_select",
    objectiveId: objective,
    correctAnswer: ["Gravity", "Friction"],
    guidance: "Both are forces",
  });
});
