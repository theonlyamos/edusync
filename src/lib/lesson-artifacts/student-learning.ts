export type PublishedObjective = {
  id: string;
  text: string;
  position: number;
  revision: number;
  artifactIds?: string[];
};

export type StudentObjectiveSummary = Omit<PublishedObjective, 'artifactIds'> & {
  artifactCounts: {
    visualizations: number;
    quizzes: number;
    resources: number;
  };
};

export type StudentLessonDetail = {
  lesson: {
    id: string;
    title: string;
    subject: string;
    gradeLevel: string;
    content: string | null;
  };
  publicationVersion: number;
  objectives: StudentObjectiveSummary[];
};

type PublishedArtifactSummary = {
  id: string;
  kind: string;
};

const cleanObjectiveList = (values: unknown[]) => values
  .filter((value): value is string => typeof value === 'string')
  .map((value) => value.trim())
  .filter(Boolean);

export function normalizeLegacyObjectives(value: unknown): string[] {
  if (Array.isArray(value)) return cleanObjectiveList(value);
  if (typeof value !== 'string' || !value.trim()) return [];

  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return cleanObjectiveList(parsed);
    } catch {
      // Fall back to the human-entered newline format.
    }
  }

  return cleanObjectiveList(trimmed.split(/\r?\n/));
}

export function normalizePublishedObjectives(value: unknown): PublishedObjective[] | null {
  let candidate = value;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(candidate)) return null;

  const normalized: PublishedObjective[] = [];
  const ids = new Set<string>();
  for (const item of candidate) {
    if (!item || typeof item !== 'object') return null;
    const objective = item as Record<string, unknown>;
    const id = typeof objective.id === 'string' ? objective.id.trim() : '';
    const text = typeof objective.text === 'string' ? objective.text.trim() : '';
    const position = objective.position;
    const revision = objective.revision;
    const artifactIds = objective.artifactIds;
    if (
      !id || ids.has(id) || !text
      || !Number.isInteger(position) || Number(position) < 0
      || !Number.isInteger(revision) || Number(revision) < 1
      || (artifactIds !== undefined && (
        !Array.isArray(artifactIds)
        || artifactIds.some((artifactId) => typeof artifactId !== 'string' || !artifactId.trim())
      ))
    ) return null;

    ids.add(id);
    normalized.push({
      id,
      text,
      position: Number(position),
      revision: Number(revision),
      ...(Array.isArray(artifactIds) ? { artifactIds: artifactIds.map((artifactId) => artifactId.trim()) } : {}),
    });
  }
  return normalized;
}

export function selectPublishedObjective<T extends PublishedObjective>(
  objectives: T[],
  requestedObjectiveId?: string,
): T | undefined {
  if (requestedObjectiveId) return objectives.find((objective) => objective.id === requestedObjectiveId);
  return [...objectives].sort((left, right) => left.position - right.position)[0];
}

export function isObjectiveSelectionChange(
  currentObjectiveId: string | null | undefined,
  nextObjectiveId: string,
): boolean {
  return Boolean(currentObjectiveId && currentObjectiveId !== nextObjectiveId);
}

export function summarizePublishedObjectives(input: {
  objectives: PublishedObjective[];
  artifacts: PublishedArtifactSummary[];
}): StudentObjectiveSummary[] {
  const artifactsById = new Map(input.artifacts.map((artifact) => [artifact.id, artifact]));

  return [...input.objectives]
    .sort((left, right) => left.position - right.position)
    .map(({ artifactIds = [], ...objective }) => {
      const counts = { visualizations: 0, quizzes: 0, resources: 0 };
      for (const artifactId of artifactIds) {
        const kind = artifactsById.get(artifactId)?.kind;
        if (['interactive_visualization', 'generated_image'].includes(kind ?? '')) counts.visualizations += 1;
        if (['structured_quiz', 'visual_quiz'].includes(kind ?? '')) counts.quizzes += 1;
        if (kind === 'uploaded_media') counts.resources += 1;
      }
      return { ...objective, artifactCounts: counts };
    });
}

export function buildStudentLessonDetail(input: {
  publicationVersion: number;
  manifest: {
    lesson: StudentLessonDetail['lesson'];
    objectives: PublishedObjective[];
  };
  artifacts: PublishedArtifactSummary[];
}): StudentLessonDetail {
  return {
    lesson: input.manifest.lesson,
    publicationVersion: input.publicationVersion,
    objectives: summarizePublishedObjectives({
      objectives: input.manifest.objectives,
      artifacts: input.artifacts,
    }),
  };
}
