import 'server-only';
import type { ServiceSupabase } from '@/lib/school-access.server';
import { RecordsError } from '@/lib/school-records.server';
import { CALENDAR_MAX_ENTRIES, overlappingTerm, parseCalendarInput, sortEntries, type CalendarEntry, type CalendarInput, type CalendarKind } from '@/lib/school-calendar';

const FIELDS = 'id, kind, title, starts_on, ends_on';
type Row = { id: string; kind: string; title: string; starts_on: string; ends_on: string };

const toEntry = (row: Row): CalendarEntry => ({ id: row.id, kind: row.kind as CalendarKind, title: row.title, startsOn: row.starts_on, endsOn: row.ends_on });

/** Every entry in the school's calendar, oldest first. */
export async function listCalendar(supabase: ServiceSupabase, schoolId: string): Promise<CalendarEntry[]> {
  const { data, error } = await supabase.from('school_calendar_entries').select(FIELDS).eq('organization_id', schoolId).order('starts_on').limit(CALENDAR_MAX_ENTRIES);
  if (error) throw error;
  return sortEntries(((data ?? []) as Row[]).map(toEntry));
}

function checked(body: unknown, existing: CalendarEntry[], ignoreId?: string): CalendarInput {
  const input = parseCalendarInput(body);
  if (typeof input === 'string') throw new RecordsError(input);
  const clash = overlappingTerm(existing, input, ignoreId);
  if (clash) throw new RecordsError(`These dates overlap “${clash.title}”. Terms can’t overlap.`, 409);
  return input;
}

export async function addCalendarEntry(supabase: ServiceSupabase, schoolId: string, userId: string, body: unknown): Promise<CalendarEntry> {
  const existing = await listCalendar(supabase, schoolId);
  if (existing.length >= CALENDAR_MAX_ENTRIES) throw new RecordsError('The calendar is full. Remove old entries first.', 409);
  const input = checked(body, existing);
  const { data, error } = await supabase
    .from('school_calendar_entries')
    .insert({ organization_id: schoolId, kind: input.kind, title: input.title, starts_on: input.startsOn, ends_on: input.endsOn, created_by: userId })
    .select(FIELDS)
    .single();
  if (error) throw writeError(error);
  return toEntry(data as Row);
}

/** The database refuses a term that overlaps another one, which also covers two people saving at once. */
const OVERLAP = '23P01';
const writeError = (error: { code?: string }) =>
  error.code === OVERLAP ? new RecordsError('These dates overlap another term. Terms can’t overlap.', 409) : error;

const requireId = (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new RecordsError('Calendar entry not found', 404);
};

export async function updateCalendarEntry(supabase: ServiceSupabase, schoolId: string, id: string, body: unknown): Promise<CalendarEntry> {
  requireId(id);
  const existing = await listCalendar(supabase, schoolId);
  if (!existing.some((entry) => entry.id === id)) throw new RecordsError('Calendar entry not found', 404);
  const input = checked(body, existing, id);
  const { data, error } = await supabase
    .from('school_calendar_entries')
    .update({ kind: input.kind, title: input.title, starts_on: input.startsOn, ends_on: input.endsOn, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', schoolId)
    .select(FIELDS)
    .maybeSingle();
  if (error) throw writeError(error);
  if (!data) throw new RecordsError('Calendar entry not found', 404);
  return toEntry(data as Row);
}

export async function removeCalendarEntry(supabase: ServiceSupabase, schoolId: string, id: string): Promise<void> {
  requireId(id);
  const { data, error } = await supabase.from('school_calendar_entries').delete().eq('id', id).eq('organization_id', schoolId).select('id');
  if (error) throw error;
  if (!data?.length) throw new RecordsError('Calendar entry not found', 404);
}
