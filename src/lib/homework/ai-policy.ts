export function isGeneralHomeworkAiTool(path: string, method: string) {
  if (method !== "POST") return false;
  return (
    [
      "/api/tutor",
      "/api/genai/ephemeral",
      "/api/genai/visualize",
      "/api/students/illustrator",
      "/api/students/collaborator/chat",
      "/api/students/practice/generate",
      "/api/learning/sessions",
      "/api/learning-runs",
      "/api/content/generate",
      "/api/lessons/generate",
    ].includes(path) ||
    /^\/api\/learning-runs\/[^/]+\/artifacts\/next$/.test(path) ||
    /^\/api\/learning-artifact-instances\/[^/]+\/retry$/.test(path)
  );
}
