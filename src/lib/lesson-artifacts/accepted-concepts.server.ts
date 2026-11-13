import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { acceptedCreativeConcepts } from './creative-concept';

/** The creative concept each objective's current materials were generated from, if any. */
export async function loadAcceptedConcepts(
  supabase: SupabaseClient,
  lessonId: string,
  objectives: Array<{ id: string; revision: number }>,
) {
  // At most one row per active objective; a busy objective cannot hide another one's plan.
  const results = await Promise.all(objectives.map((objective) => supabase.from('content_jobs')
    .select('objective_id,input').eq('lesson_id', lessonId).eq('objective_id', objective.id)
    .eq('input->>objectiveRevision', String(objective.revision)).not('input->>creativeConcept', 'is', null)
    .order('created_at', { ascending: false }).limit(1)));
  const jobs = results.flatMap(({ data, error }) => {
    if (error) throw error;
    return data ?? [];
  });
  return acceptedCreativeConcepts(objectives, jobs);
}
