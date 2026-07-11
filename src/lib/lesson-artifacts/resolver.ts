import type { ArtifactKind, LessonArtifactRecord } from './domain';

export type LearningArtifactKind = 'visualization' | 'quiz';

export function consumedArtifactIdsFromEvents(
  events: Array<{ artifactId: string | null; eventType: string }>,
): Set<string> {
  const consumedEvents = new Set(['artifact_rendered', 'quiz_submitted', 'visual_quiz_completed']);
  return new Set(
    events
      .filter((event) => event.artifactId && consumedEvents.has(event.eventType))
      .map((event) => event.artifactId as string),
  );
}

const belongsToKind = (artifactKind: ArtifactKind, requestedKind: LearningArtifactKind) =>
  requestedKind === 'visualization'
    ? ['interactive_visualization', 'generated_image', 'uploaded_media'].includes(artifactKind)
    : ['structured_quiz', 'visual_quiz'].includes(artifactKind);

export function selectNextPublishedArtifact(input: {
  artifacts: LessonArtifactRecord[];
  publishedArtifactIds: ReadonlySet<string>;
  consumedArtifactIds: ReadonlySet<string>;
  kind: LearningArtifactKind;
}): LessonArtifactRecord | undefined {
  return input.artifacts
    .filter(
      (artifact) =>
        artifact.status === 'approved' &&
        input.publishedArtifactIds.has(artifact.id) &&
        !input.consumedArtifactIds.has(artifact.id) &&
        belongsToKind(artifact.kind, input.kind),
    )
    .sort((left, right) => left.position - right.position || left.version - right.version)[0];
}
