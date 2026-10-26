'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Point = { date: string; value: number };

function shortDate(date: string) {
  // date is YYYY-MM-DD in the school's time zone; show it without shifting days.
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** One measure per day as thin bars, with a hover tooltip and a table for screen readers. */
export function ActivityChart({ data, label, unit }: { data: Point[]; label: string; unit: (n: number) => string }) {
  const total = data.reduce((sum, p) => sum + p.value, 0);
  return (
    <figure className="min-w-0">
      <div className="h-48 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as Point;
                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                    <p className="font-medium">{shortDate(point.date)}</p>
                    <p className="text-muted-foreground">{unit(point.value)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" name={label} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {label}: {unit(total)} in total over {data.length} days.
      </figcaption>
      {/* Tables ignore sr-only's 1px size, so the wrapper does the hiding.
          Otherwise the full-height table stretches the page. */}
      <div className="sr-only">
        <table>
          <caption>{label} by day</caption>
          <thead><tr><th>Day</th><th>{label}</th></tr></thead>
          <tbody>{data.map((p) => <tr key={p.date}><td>{shortDate(p.date)}</td><td>{p.value}</td></tr>)}</tbody>
        </table>
      </div>
    </figure>
  );
}
