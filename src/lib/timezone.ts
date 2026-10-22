// Helpers for showing and entering times in a school's timezone, whatever
// timezone the teacher's device is set to.

export function isValidTimezone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The device's timezone, or UTC if the browser can't say. */
export function deviceTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(zone) ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** First valid timezone in the list, falling back to UTC. */
export function pickTimezone(...candidates: (string | null | undefined)[]): string {
  return candidates.find(isValidTimezone) ?? 'UTC';
}

function parts(date: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return values;
}

/** Minutes the zone is ahead of UTC at this instant (Accra 0, Lagos 60, New York -240 in summer). */
function offsetMinutes(date: Date, timeZone: string) {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** ISO instant -> value for a datetime-local input, shown in the given zone. */
export function zonedInput(value: string, timeZone: string): string {
  const p = parts(new Date(value), timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** datetime-local value typed in the given zone -> ISO instant. */
export function zonedValue(local: string, timeZone: string): string {
  const naive = new Date(`${local}:00Z`);
  if (Number.isNaN(naive.getTime())) throw new Error('Enter a valid date and time');
  // Guess with the offset at the naive time, then correct once for DST changes.
  let guess = naive.getTime() - offsetMinutes(naive, timeZone) * 60000;
  guess = naive.getTime() - offsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess).toISOString();
}
