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

type SavedObjective = { id: string; text: string; position: number; revision: number; visualInstructions: string };
type DraftObjective = { id?: string; text: string; visualInstructions?: string };

export type DirectionEditImpact = {
  /** The approved lesson introduction would need a new image. */
  lessonIntroduction: boolean;
  /** Saved objectives whose approved materials would become outdated or be removed. */
  objectives: Array<{ id: string; position: number; text: string; approved: number; removed: boolean }>;
  /** Approved items that stop counting toward publishing after the save. */
  total: number;
};

const clean = (value: string | undefined) => (value ?? '').trim();

/**
 * Mirrors the database revision rules (save_lesson_objectives and the
 * lessons_visual_revision trigger) so the Studio can warn before a save
 * turns approved work into "earlier directions".
 */
export function directionEditImpact(
  saved: { lessonInstructions: string; lessonRevision: number; objectives: SavedObjective[]; artifacts: StudioArtifact[] },
  draft: { lessonInstructions: string; objectives: DraftObjective[] },
): DirectionEditImpact {
  const ordered = [...saved.objectives].sort((a, b) => a.position - b.position);
  const lessonChanged = clean(saved.lessonInstructions) !== clean(draft.lessonInstructions);
  const objectiveListChanged = ordered.map(item => clean(item.text)).join('\n') !== draft.objectives.map(item => clean(item.text)).join('\n');
  const introApproved = saved.artifacts.some(item => item.objective_id === null && item.status === 'approved'
    && item.objective_revision === saved.lessonRevision && item.payload.kind === 'generated_image' && item.payload.introductionFor === 'lesson');
  const lessonIntroduction = introApproved && (lessonChanged || objectiveListChanged);

  const objectives = ordered.flatMap((objective) => {
    const next = draft.objectives.find(item => item.id === objective.id);
    const removed = !next;
    const changed = removed || lessonChanged || clean(next.text) !== clean(objective.text)
      || (next.visualInstructions !== undefined && clean(next.visualInstructions) !== clean(objective.visualInstructions));
    if (!changed) return [];
    const approved = getStudioMaterials(saved.artifacts, objective.id, objective.revision).filter(item => item.approved).length;
    return approved ? [{ id: objective.id, position: objective.position, text: objective.text, approved, removed }] : [];
  });

  return { lessonIntroduction, objectives, total: Number(lessonIntroduction) + objectives.reduce((sum, item) => sum + item.approved, 0) };
}

/** Six objectives (30 materials) finish well inside one background generation run. */
export const PREPARE_OBJECTIVES_LIMIT = 6;

/**
 * Objectives with nothing generated for their current directions, in order.
 * These are the ones "Prepare all objectives" fills in.
 */
export function unpreparedObjectives<T extends { id: string; revision: number; position: number }>(objectives: T[], artifacts: StudioArtifact[]) {
  return [...objectives].sort((a, b) => a.position - b.position).filter(objective => !artifacts.some(item =>
    item.objective_id === objective.id && item.objective_revision === objective.revision && item.kind !== 'uploaded_media'
    && !['failed', 'rejected'].includes(item.status)));
}

export type ReviewStep = { objectiveId: string | null; key: string; approved: boolean; hasMaterial: boolean };

/**
 * Where to go after approving something: the next item waiting for review,
 * then the next item that still needs generating, looking past the current
 * step first and wrapping around. Null means everything is approved.
 */
export function nextReviewStep(order: ReviewStep[], current: { objectiveId: string | null; key: string }) {
  const index = order.findIndex(step => step.objectiveId === current.objectiveId && step.key === current.key);
  const rotated = [...order.slice(index + 1), ...order.slice(0, Math.max(index, 0))];
  return rotated.find(step => !step.approved && step.hasMaterial) ?? rotated.find(step => !step.approved) ?? null;
}

/** "All 42 JHS 1 students at Hillside School", for the publish step. */
export function audienceSummary(
  audience: { schoolName: string | null; gradeLevel: string; students: number | null; classes?: { id: string; name: string }[]; classIds?: string[] } | null | undefined,
  formatGrade: (grade: string) => string,
) {
  if (!audience?.gradeLevel) return null;
  const grade = formatGrade(audience.gradeLevel);
  const where = audience.schoolName ? ` at ${audience.schoolName}` : '';
  const chosen = (audience.classes ?? []).filter((c) => audience.classIds?.includes(c.id));
  if (chosen.length > 0) {
    const names = chosen.map((c) => (c.name.toLowerCase().startsWith(grade.toLowerCase()) ? c.name : `${grade} ${c.name}`));
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    if (!audience.students) return `Students in ${list}${where}. No one is in ${names.length === 1 ? 'it' : 'them'} yet`;
    return `${audience.students === 1 ? 'The 1 student' : `The ${audience.students} students`} in ${list}${where}`;
  }
  if (audience.students === null) return `Every ${grade} student${where}`;
  if (audience.students === 0) return `${grade} students${where}. None have joined yet, so new ${grade} students will see it when they join`;
  return `${audience.students === 1 ? 'The 1' : `All ${audience.students}`} ${grade} student${audience.students === 1 ? '' : 's'}${where}`;
}
