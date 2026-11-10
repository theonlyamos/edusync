import 'server-only';
import { DataPacket_Kind, RoomServiceClient } from 'livekit-server-sdk';
import { env } from '@/lib/env';
import { liveClassRoomName } from '@/lib/live-class';
import { eventClassIds, isEligibleLiveClassAttendee } from '@/lib/live-class-attendance';
import { POLL_TOPIC, pollForViewer, tallyVotes, type PollBroadcast, type PollInput, type PollView } from '@/lib/live-class-polls';
import { getLiveKitHttpHost } from '@/lib/livekit-token';
import { createServerSupabase } from '@/lib/supabase.server';

type Supabase = ReturnType<typeof createServerSupabase>;
type PollRow = { id: string; question: string; options: unknown; status: 'open' | 'closed'; created_at: string; closed_at: string | null };
export type PollAccess = { eventId: string; roomName: string; isHost: boolean };

const POLL_COLUMNS = 'id, question, options, status, created_at, closed_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

/**
 * The class, if this person hosts it, or is enrolled in it and may still attend
 * (active in the school, in the class's grade and audience), the same test the
 * room itself applies. Anyone else has no business with its polls.
 */
export async function pollAccess(supabase: Supabase, eventId: string, userId: string): Promise<PollAccess | null> {
  if (!isUuid(eventId)) return null;
  const { data: event } = await supabase.from('live_class_events').select('id, organizer_id, livekit_room_name, grade_level, organization_id, audience_class_ids').eq('id', eventId).maybeSingle();
  if (!event) return null;
  const isHost = event.organizer_id === userId;
  if (!isHost) {
    const { data: enrolled } = await supabase.from('live_class_enrollments').select('id').eq('live_class_event_id', eventId).eq('user_id', userId).maybeSingle();
    if (!enrolled) return null;
    const eligible = await isEligibleLiveClassAttendee(supabase, {
      organizerId: event.organizer_id as string,
      attendeeUserId: userId,
      eventGradeLevel: event.grade_level as string | null,
      eventOrganizationId: (event.organization_id as string | null) ?? null,
      eventClassIds: eventClassIds(event),
    });
    if (!eligible) return null;
  }
  return { eventId, roomName: liveClassRoomName(eventId, event.livekit_room_name as string | null), isHost };
}

async function withCounts(supabase: Supabase, row: PollRow): Promise<{ poll: PollBroadcast & { counts: number[] }; votes: Array<{ user_id: string; option_index: number }> }> {
  const options = Array.isArray(row.options) ? row.options.map(String) : [];
  const { data, error } = await supabase.from('live_class_poll_votes').select('user_id, option_index').eq('poll_id', row.id).limit(2000);
  if (error) throw error;
  const votes = data ?? [];
  const counts = tallyVotes(options.length, votes.map((vote) => vote.option_index));
  return {
    votes,
    poll: { id: row.id, question: row.question, options, status: row.status, totalVotes: counts.reduce((sum, count) => sum + count, 0), counts, createdAt: row.created_at, closedAt: row.closed_at },
  };
}

/** The class's latest poll as this person may see it, or null when there has been none. */
export async function latestPoll(supabase: Supabase, access: PollAccess, userId: string): Promise<PollView | null> {
  const { data: row, error } = await supabase.from('live_class_polls').select(POLL_COLUMNS).eq('live_class_event_id', access.eventId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const { poll, votes } = await withCounts(supabase, row as PollRow);
  return pollForViewer(poll, { isHost: access.isHost, myVote: votes.find((vote) => vote.user_id === userId)?.option_index ?? null });
}

/**
 * Tells everyone in the room about a poll, so nobody has to keep asking.
 * Totals of an open poll are left out. If the room can't be reached the poll
 * still works: each person's page checks again on its own, just less often.
 */
async function broadcast(access: PollAccess, poll: PollBroadcast & { counts: number[] }): Promise<void> {
  const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret } = env();
  if (!apiKey || !apiSecret) return;
  const message: PollBroadcast = poll.status === 'closed' ? poll : { ...poll, counts: null, totalVotes: 0 };
  try {
    await new RoomServiceClient(getLiveKitHttpHost(), apiKey, apiSecret).sendData(
      access.roomName,
      new TextEncoder().encode(JSON.stringify({ type: 'poll', poll: message })),
      DataPacket_Kind.RELIABLE,
      { topic: POLL_TOPIC },
    );
  } catch (error) {
    console.warn('[polls] could not tell the room', (error as Error)?.message);
  }
}

async function closeRows(supabase: Supabase, eventId: string, pollId?: string): Promise<PollRow[]> {
  let query = supabase.from('live_class_polls').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('live_class_event_id', eventId).eq('status', 'open');
  if (pollId) query = query.eq('id', pollId);
  const { data, error } = await query.select(POLL_COLUMNS);
  if (error) throw error;
  return (data ?? []) as PollRow[];
}

/** Starts a poll. Any poll still open in the class is ended first. */
export async function createPoll(supabase: Supabase, access: PollAccess, userId: string, input: PollInput): Promise<PollView> {
  await closeRows(supabase, access.eventId);
  const { data: row, error } = await supabase
    .from('live_class_polls')
    .insert({ live_class_event_id: access.eventId, created_by: userId, question: input.question, options: input.options })
    .select(POLL_COLUMNS)
    .single();
  if (error) throw error;
  const { poll } = await withCounts(supabase, row as PollRow);
  await broadcast(access, poll);
  return pollForViewer(poll, { isHost: true, myVote: null });
}

/** Ends a poll and shares the results with the class. Null when it was not open. */
export async function closePoll(supabase: Supabase, access: PollAccess, pollId: string): Promise<PollView | null> {
  if (!isUuid(pollId)) return null;
  const [row] = await closeRows(supabase, access.eventId, pollId);
  if (!row) return null;
  const { poll } = await withCounts(supabase, row);
  await broadcast(access, poll);
  return pollForViewer(poll, { isHost: true, myVote: null });
}

/** Records this person's answer. False when the poll isn't open in this class or the answer isn't one of its options. */
export async function castVote(supabase: Supabase, access: PollAccess, pollId: string, userId: string, option: unknown): Promise<boolean> {
  if (!isUuid(pollId) || !Number.isInteger(option)) return false;
  const { data: poll } = await supabase.from('live_class_polls').select('id').eq('id', pollId).eq('live_class_event_id', access.eventId).maybeSingle();
  if (!poll) return false;
  const { data, error } = await supabase.rpc('cast_live_class_poll_vote', { p_poll_id: pollId, p_user_id: userId, p_option: option as number });
  if (error) throw error;
  return data === true;
}
