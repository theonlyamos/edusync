// One date style across the portal: "22 Oct 2026" and "22 Oct 2026, 15:08".
// Times use the device's timezone unless a timezone is given.

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: unknown, timeZone?: string): string {
  const date = toDate(value);
  if (!date) return 'Not available';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(date);
}

export function formatDateTime(value: unknown, timeZone?: string): string {
  const date = toDate(value);
  if (!date) return 'Not available';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(date);
}

/** "15:08", for the end of a range on the same day. */
export function formatTime(value: unknown, timeZone?: string): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(date);
}

/** "22 Oct 2026, 15:00–16:00", or both full dates when the range crosses midnight. */
export function formatDateTimeRange(start: unknown, end: unknown, timeZone?: string): string {
  const from = toDate(start), to = toDate(end);
  if (!from) return 'Not available';
  if (!to) return formatDateTime(from, timeZone);
  return formatDate(from, timeZone) === formatDate(to, timeZone)
    ? `${formatDateTime(from, timeZone)}–${formatTime(to, timeZone)}`
    : `${formatDateTime(from, timeZone)} – ${formatDateTime(to, timeZone)}`;
}
