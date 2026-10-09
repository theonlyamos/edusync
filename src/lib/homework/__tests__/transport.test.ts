import { afterEach, it, expect, vi } from "vitest";
import { homeworkRequest } from "@/components/homework/shared";
afterEach(() => vi.unstubAllGlobals());
it("treats interrupted successful responses as failures so browser drafts are retained", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response('{"version":', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  await expect(homeworkRequest("/api/homework/test/actions")).rejects.toThrow(
    "interrupted",
  );
});
