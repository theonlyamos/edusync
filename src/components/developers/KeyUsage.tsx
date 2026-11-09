'use client';

import { useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { homeworkRequest } from '@/components/homework/shared';
import { usageDayLabel, usageTotals, type UsageDay } from '@/lib/embed-usage';

const PLOT_HEIGHT = 96;

/** One bar per day. Hover or focus a bar for that day's numbers; a table carries the same data. */
function UsageChart({ days }: { days: UsageDay[] }) {
  const [active, setActive] = useState<number | null>(null);
  const peak = Math.max(1, ...days.map((day) => day.requests));
  const shown = active === null ? null : days[active];
  return (
    <div>
      <p className="mb-1 h-5 text-xs text-muted-foreground" aria-live="polite">
        {shown
          ? <><span className="font-medium text-foreground">{usageDayLabel(shown.day)}</span>: {shown.requests} {shown.requests === 1 ? 'request' : 'requests'}, {shown.sessions} {shown.sessions === 1 ? 'session' : 'sessions'}</>
          : `Requests per day. Peak ${peak === 1 && days.every((day) => day.requests === 0) ? 0 : peak}.`}
      </p>
      <div className="flex items-end gap-0.5 border-b border-border" style={{ height: PLOT_HEIGHT }} onMouseLeave={() => setActive(null)}>
        {days.map((day, index) => (
          <button
            key={day.day}
            type="button"
            aria-label={`${usageDayLabel(day.day)}: ${day.requests} requests, ${day.sessions} sessions`}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            className="group flex h-full min-w-0 flex-1 items-end focus-visible:outline-none"
          >
            <span
              className="block w-full rounded-t-[4px] bg-primary/70 transition-colors group-hover:bg-primary group-focus-visible:bg-primary"
              style={{ height: day.requests ? Math.max(3, Math.round((day.requests / peak) * PLOT_HEIGHT)) : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{usageDayLabel(days[0].day)}</span>
        <span>{usageDayLabel(days[days.length - 1].day)}</span>
      </div>
      <div className="sr-only">
        <table>
          <caption>Requests and sessions per day</caption>
          <thead><tr><th>Day</th><th>Requests</th><th>Sessions</th></tr></thead>
          <tbody>{days.map((day) => <tr key={day.day}><td>{usageDayLabel(day.day)}</td><td>{day.requests}</td><td>{day.sessions}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

/** "Usage" for one API key: totals and a 30-day chart, loaded when opened. */
export function KeyUsage({ keyId }: { keyId: string }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<UsageDay[] | null>(null);
  const [problem, setProblem] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setProblem('');
    try {
      setDays((await homeworkRequest<{ days: UsageDay[] }>(`/api/embed/keys/${keyId}/usage`)).days);
    } catch (error) {
      setProblem((error as Error).message || 'Could not load usage.');
    } finally {
      setLoading(false);
    }
  };
  const toggle = () => {
    if (!open && !days) void load();
    setOpen(!open);
  };
  const totals = days ? usageTotals(days) : null;

  return (
    <div className="rounded-md border">
      <Button variant="ghost" onClick={toggle} aria-expanded={open} className="h-11 w-full justify-start gap-2 px-3 text-sm">
        <BarChart3 className="h-4 w-4" aria-hidden /> Usage in the last 30 days
      </Button>
      {open && (
        <div className="space-y-3 border-t p-3">
          {loading && <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />}
          {problem && (
            <p role="alert" className="text-sm text-muted-foreground">
              {problem} <button type="button" className="underline" onClick={() => void load()}>Try again</button>
            </p>
          )}
          {days && totals && days.length > 0 && (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-muted-foreground">Requests</dt><dd className="text-lg font-semibold tabular-nums">{totals.requests.toLocaleString()}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Sessions started</dt><dd className="text-lg font-semibold tabular-nums">{totals.sessions.toLocaleString()}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Days used</dt><dd className="text-lg font-semibold tabular-nums">{totals.activeDays}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Busiest day</dt><dd className="text-lg font-semibold">{totals.busiest ? usageDayLabel(totals.busiest.day) : 'None yet'}</dd></div>
              </dl>
              {totals.requests > 0 ? <UsageChart days={days} /> : <p className="text-sm text-muted-foreground">This key hasn’t been used in the last 30 days.</p>}
              <p className="text-xs text-muted-foreground">Days are counted in UTC.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
