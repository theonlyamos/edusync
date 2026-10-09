export async function readAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maximum = 20000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from <= maximum; from += 500) {
    const result = await page(from, from + 499);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if (rows.length > maximum)
      throw new Error("Homework history exceeds the report limit");
    if ((result.data?.length ?? 0) < 500) return rows;
  }
  throw new Error("Homework history exceeds the report limit");
}
