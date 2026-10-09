import { it, expect } from "vitest";
import { readAll } from "../read-all";
it("pages through capped database responses and never returns a silent partial report", async () => {
  const values = Array.from({ length: 1201 }, (_, i) => i);
  expect(
    await readAll(async (from, to) => ({
      data: values.slice(from, to + 1),
      error: null,
    })),
  ).toEqual(values);
  await expect(
    readAll(
      async (from, to) => ({ data: values.slice(from, to + 1), error: null }),
      1000,
    ),
  ).rejects.toThrow("report limit");
  await expect(
    readAll(async () => ({
      data: null,
      error: new Error("database unavailable"),
    })),
  ).rejects.toThrow("database unavailable");
});
