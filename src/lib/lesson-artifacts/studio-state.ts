import type { ArtifactPayload, ArtifactKind, ArtifactStatus } from './domain';
import { artifactMaterialRole } from './creative-concept';

export type StudioArtifact = {
  id: string;
  objective_id: string | null;
  objective_revision: number;
  series_id: string;
  version: number;
  kind: ArtifactKind;
  status: ArtifactStatus;
  position: number;
  created_at?: string;
  payload: ArtifactPayload;
  generation_metadata?: { materialRole?: unknown } | null;
  validation_report?: { status?: string; validator?: string; error?: string } | null;
};

export type StudioMaterial = {
  key: string;
  label: string;
  description: string;
  artifacts: StudioArtifact[];
  approved: boolean;
};

export function latestStudioArtifacts(artifacts: StudioArtifact[]): StudioArtifact[] {
  const latest = new Map<string, StudioArtifact>();
  for (const artifact of artifacts) {
    const previous = latest.get(artifact.series_id);
    if (!previous || artifact.version > previous.version) latest.set(artifact.series_id, artifact);
  }
  return [...latest.values()].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.version - a.version);
}

export function getStudioMaterials(artifacts: StudioArtifact[], objectiveId: string, revision: number): StudioMaterial[] {
  const scoped = artifacts.filter(artifact => artifact.objective_id === objectiveId);
  const groups = [
    { key: 'introduction', label: 'Introduction', description: 'The first visual students see when they start this objective.', matches: (item: StudioArtifact) => item.kind === 'generated_image' },
    { key: 'exploration', label: 'Explore', description: 'Let students discover the relationship by changing something.', matches: (item: StudioArtifact) => artifactMaterialRole(item) === 'exploration' },
    { key: 'application', label: 'Apply', description: 'Use a different situation to put the relationship into practice.', matches: (item: StudioArtifact) => artifactMaterialRole(item) === 'application' },
    { key: 'knowledge', label: 'Knowledge check', description: 'Check the questions, correct answers, and explanations.', matches: (item: StudioArtifact) => item.kind === 'structured_quiz' },
    { key: 'challenge', label: 'Visual challenge', description: 'Test understanding through a visual decision or puzzle.', matches: (item: StudioArtifact) => item.kind === 'visual_quiz' },
    ...(scoped.some(item => item.kind === 'uploaded_media') ? [{ key: 'media', label: 'Teacher resources', description: 'Supporting materials you have added to this objective.', matches: (item: StudioArtifact) => item.kind === 'uploaded_media' }] : []),
  ];
  return groups.map(({ matches, ...group }) => {
    const candidates = scoped.filter(matches);
    return {
      ...group,
      artifacts: latestStudioArtifacts(candidates).sort((a, b) => Number(b.objective_revision === revision) - Number(a.objective_revision === revision)),
      approved: candidates.some(item => item.status === 'approved' && item.objective_revision === revision &&
        (group.key !== 'introduction' || (item.payload.kind === 'generated_image' && item.payload.introductionFor === 'objective'))),
    };
  });
}
