export function shouldApplyRemoteObjectives(input: { dirty: boolean; force: boolean }): boolean {
  return input.force || !input.dirty;
}

export type ArtifactAction = 'approve' | 'reject' | 'regenerate';
export type ArtifactBusyState = { artifactId: string; action: ArtifactAction } | undefined;

export function isArtifactActionBusy(
  state: ArtifactBusyState,
  artifactId: string,
  action: ArtifactAction,
): boolean {
  return state?.artifactId === artifactId && state.action === action;
}

export type ContentJobSummary = {
  total: number;
  done: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  active: number;
};

export function summarizeContentJobs(jobs: Array<{ status: string }>): ContentJobSummary {
  const succeeded = jobs.filter((job) => job.status === 'succeeded').length;
  const failed = jobs.filter((job) => job.status === 'failed').length;
  const cancelled = jobs.filter((job) => job.status === 'cancelled').length;
  const done = succeeded + failed + cancelled;
  return { total: jobs.length, done, succeeded, failed, cancelled, active: jobs.length - done };
}

type LessonDraftFields = { title: string; objectives: string[]; content: string };

export function mergeGeneratedLessonDraft(input: {
  current: LessonDraftFields;
  generated: LessonDraftFields;
  replaceExisting: boolean;
}): LessonDraftFields {
  const hasManualObjectives = input.current.objectives.some((objective) => objective.trim());
  return {
    title: input.current.title.trim() || input.generated.title,
    objectives: input.replaceExisting || !hasManualObjectives ? input.generated.objectives : input.current.objectives,
    content: input.replaceExisting || !input.current.content.trim() ? input.generated.content : input.current.content,
  };
}
