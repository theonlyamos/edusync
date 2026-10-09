import { describe, it, expect } from "vitest";
import { isGeneralHomeworkAiTool } from "../ai-policy";
describe("homework AI entry points", () => {
  it("covers unscoped tutoring, live tokens, creative tools and generated practice", () => {
    for (const path of [
      "/api/tutor",
      "/api/genai/ephemeral",
      "/api/genai/visualize",
      "/api/students/illustrator",
      "/api/students/collaborator/chat",
      "/api/students/practice/generate",
      "/api/learning-runs/x/artifacts/next",
      "/api/learning-artifact-instances/x/retry",
    ])
      expect(isGeneralHomeworkAiTool(path, "POST")).toBe(true);
  });
  it("allows controlled homework hints and ordinary reads and submissions", () => {
    for (const path of [
      "/api/homework/x/help",
      "/api/homework/x/actions",
      "/api/students/practice/submit",
      "/api/tutor",
    ])
      expect(
        isGeneralHomeworkAiTool(path, path === "/api/tutor" ? "GET" : "POST"),
      ).toBe(false);
  });
});
