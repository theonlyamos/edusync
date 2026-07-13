export function createAsyncRequestDeduper() {
  const inFlight = new Map<string, Promise<unknown>>();

  return {
    run<T>(key: string, operation: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key) as Promise<T> | undefined;
      if (existing) return existing;

      const request = operation().finally(() => {
        if (inFlight.get(key) === request) inFlight.delete(key);
      });
      inFlight.set(key, request);
      return request;
    },
  };
}

export type LearningScopeToken = Readonly<{
  scope: string;
  version: number;
}>;

export function createLearningScopeGuard() {
  let scope: string | null = null;
  let version = 0;

  return {
    begin(nextScope: string): LearningScopeToken {
      scope = nextScope;
      version += 1;
      return { scope, version };
    },
    clear() {
      scope = null;
      version += 1;
    },
    isCurrent(token: LearningScopeToken) {
      return scope === token.scope && version === token.version;
    },
  };
}

export function appendUniqueArtifact<T extends { instanceId: string }>(current: T[], next: T): T[] {
  return current.some((artifact) => artifact.instanceId === next.instanceId)
    ? current
    : [...current, next];
}

export type ObjectiveLearningArtifact = {
  instanceId: string;
  source: 'teacher_approved' | 'session_generated';
  exhausted: boolean;
  artifact: {
    id: string;
    kind: 'interactive_visualization' | 'generated_image' | 'structured_quiz' | 'visual_quiz' | 'uploaded_media';
    payload: any;
  } & Record<string, unknown>;
};

export function normalizeRequestedArtifactKind(value: unknown): 'visualization' | 'quiz' {
  return value === 'quiz' ? 'quiz' : 'visualization';
}

export function buildObjectiveTutorPromptContext(input: {
  lessonTitle: string;
  subject?: string;
  gradeLevel?: string;
  objectiveText: string;
  lessonContent?: string | null;
}): string {
  const content = input.lessonContent?.trim();
  return `
### Objective-focused lesson session
- Lesson: ${input.lessonTitle}
- Subject: ${input.subject || 'Not specified'}
- Grade level: ${input.gradeLevel || 'Not specified'}
- Active objective: ${input.objectiveText}

Keep the entire session focused on the active objective. When a visual, illustration, or knowledge check would help, call request_learning_artifact with kind "visualization" or "quiz". That tool always uses teacher-reviewed activities before it creates a new activity.
${content ? `\nPublished lesson context:\n${content.slice(0, 2000)}` : ''}`.trim();
}
