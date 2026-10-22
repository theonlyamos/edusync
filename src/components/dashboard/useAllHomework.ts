"use client";
import { useCallback, useEffect, useState } from "react";
import { homeworkRequest } from "@/components/homework/shared";
import type { DashboardHomeworkItem } from "@/lib/dashboard";

// /api/homework returns 50 items per page. Dashboard totals need every page of
// current (draft or published) homework; archived homework is left out.
const MAX_PAGES = 20;

export function useAllHomework() {
  const [items, setItems] = useState<DashboardHomeworkItem[] | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    (async () => {
      const all: DashboardHomeworkItem[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await homeworkRequest<{
          items: DashboardHomeworkItem[];
          hasMore: boolean;
        }>(`/api/homework?active=1&page=${page}`);
        all.push(...data.items);
        if (!data.hasMore) break;
      }
      return all;
    })()
      .then((all) => {
        if (live) setItems(all);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  return { items, error, loading, refresh };
}
