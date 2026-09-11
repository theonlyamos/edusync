import type { buildPublicationManifest } from './domain';

export function missingPublicationIntroductions(manifest: ReturnType<typeof buildPublicationManifest>): string[] {
  return [
    ...(!manifest.lesson.introductionArtifactId ? ['lesson introduction'] : []),
    ...manifest.objectives.filter((objective) => !objective.introductionArtifactId).map((objective) => `objective ${objective.position + 1} introduction`),
  ];
}

export function publicationArtifactIds(manifest: { lesson?: { introductionArtifactId?: string | null }; objectives?: Array<{ artifactIds?: string[] }> }): string[] {
  return [...new Set([
    ...(manifest.lesson?.introductionArtifactId ? [manifest.lesson.introductionArtifactId] : []),
    ...(manifest.objectives ?? []).flatMap((objective) => objective.artifactIds ?? []),
  ])];
}
