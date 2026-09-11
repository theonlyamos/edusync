'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  appendUniqueArtifact,
  createAsyncRequestDeduper,
  createLearningScopeGuard,
  type LearningScopeToken,
  type ObjectiveLearningArtifact,
} from '@/lib/lesson-artifacts/objective-learning-controller';

export type LearningObjective = {
  id: string;
  text: string;
  position: number;
  revision: number;
};

type LearningRun = {
  id: string;
  active_objective_id: string;
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The objective learning session could not be loaded');
  return data;
}

export function useObjectiveLearning(options: {
  lessonId?: string | null;
  objectiveId?: string | null;
  mode?: 'companion' | 'tutor';
  autoStart?: boolean;
}) {
  const { lessonId, objectiveId, mode = 'tutor', autoStart = true } = options;
  const [run, setRun] = useState<LearningRun | null>(null);
  const [runScope, setRunScope] = useState<string | null>(null);
  const [objectives, setObjectives] = useState<LearningObjective[]>([]);
  const [artifacts, setArtifacts] = useState<ObjectiveLearningArtifact[]>([]);
  const [loading, setLoading] = useState(Boolean(lessonId && autoStart));
  const [activityLoading, setActivityLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deduperRef = useRef(createAsyncRequestDeduper());
  const scopeGuardRef = useRef(createLearningScopeGuard());
  const activeTokenRef = useRef<LearningScopeToken | null>(null);
  const transitioningRef = useRef(false);
  const scope = lessonId ? `${lessonId}:${mode}:${objectiveId ?? ''}` : null;
  const scopedRun = runScope === scope ? run : null;

  const initialize = useCallback(async (requestedObjectiveId?: string | null) => {
    if (!lessonId) return null;
    const requestScope = `${lessonId}:${mode}:${objectiveId ?? ''}`;
    const token = scopeGuardRef.current.begin(requestScope);
    activeTokenRef.current = token;
    transitioningRef.current = true;
    setLoading(true);
    setActivityLoading(false);
    setArtifacts([]);
    setError(null);
    try {
      const key = `run:${lessonId}:${mode}:${requestedObjectiveId ?? ''}`;
      const data = await deduperRef.current.run(key, async () => readJson(await fetch('/api/learning-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, mode, ...(requestedObjectiveId ? { objectiveId: requestedObjectiveId } : {}) }),
      })));
      if (!scopeGuardRef.current.isCurrent(token)) return null;
      setRun(data.run);
      setRunScope(requestScope);
      setObjectives(data.objectives ?? []);
      setArtifacts(data.introduction ? [data.introduction] : []);
      return data.run as LearningRun;
    } catch (requestError) {
      if (scopeGuardRef.current.isCurrent(token)) {
        setRun(null);
        setRunScope(requestScope);
        setObjectives([]);
        setArtifacts([]);
        setError(requestError instanceof Error ? requestError.message : 'The objective learning session could not be loaded');
      }
      return null;
    } finally {
      if (scopeGuardRef.current.isCurrent(token)) {
        transitioningRef.current = false;
        setLoading(false);
      }
    }
  }, [lessonId, mode, objectiveId]);

  useEffect(() => {
    const guard = scopeGuardRef.current;
    guard.clear();
    const timeoutId = autoStart && lessonId
      ? window.setTimeout(() => { void initialize(objectiveId); }, 0)
      : undefined;
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      guard.clear();
    };
  }, [autoStart, initialize, lessonId, mode, objectiveId]);

  const selectObjective = useCallback(async (nextObjectiveId: string) => {
    if (!scopedRun || !scope || transitioningRef.current || activeTokenRef.current?.scope !== scope) return false;
    const token = scopeGuardRef.current.begin(scope);
    activeTokenRef.current = token;
    transitioningRef.current = true;
    setLoading(true);
    setActivityLoading(false);
    setArtifacts([]);
    setError(null);
    try {
      const data = await readJson(await fetch(`/api/learning-runs/${scopedRun.id}/objective`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectiveId: nextObjectiveId }),
      }));
      if (!scopeGuardRef.current.isCurrent(token)) return false;
      setRun(data.run);
      setArtifacts(data.introduction ? [data.introduction] : []);
      return true;
    } catch (requestError) {
      if (scopeGuardRef.current.isCurrent(token)) {
        setRun(null);
        setError(requestError instanceof Error ? requestError.message : 'The objective could not be selected');
      }
      return false;
    } finally {
      if (scopeGuardRef.current.isCurrent(token)) {
        transitioningRef.current = false;
        setLoading(false);
      }
    }
  }, [scope, scopedRun]);

  const requestArtifact = useCallback(async (
    kind: 'visualization' | 'quiz',
    requestId = crypto.randomUUID(),
    taskDescription?: string,
  ) => {
    const token = activeTokenRef.current;
    if (!scopedRun || !token || token.scope !== scope || transitioningRef.current || !scopeGuardRef.current.isCurrent(token)) {
      throw new Error('The objective learning session is not ready');
    }
    setActivityLoading(true);
    setError(null);
    try {
      const attachment = await deduperRef.current.run(`artifact:${scopedRun.id}:${requestId}`, async () => readJson(await fetch(
        `/api/learning-runs/${scopedRun.id}/artifacts/next`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, requestId, ...(taskDescription?.trim() ? { taskDescription: taskDescription.trim() } : {}) }),
        },
      ))) as ObjectiveLearningArtifact;
      if (!scopeGuardRef.current.isCurrent(token)) throw new Error('The active objective has changed');
      setArtifacts((current) => appendUniqueArtifact(current, attachment));
      return attachment;
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'The learning activity could not be prepared';
      if (scopeGuardRef.current.isCurrent(token)) setError(message);
      throw requestError;
    } finally {
      if (scopeGuardRef.current.isCurrent(token)) setActivityLoading(false);
    }
  }, [scope, scopedRun]);

  const activeObjective = useMemo(
    () => objectives.find((objective) => objective.id === scopedRun?.active_objective_id) ?? null,
    [objectives, scopedRun?.active_objective_id],
  );

  return {
    runId: !loading ? scopedRun?.id ?? null : null,
    objectives: scopedRun ? objectives : [],
    activeObjective,
    artifacts: scopedRun && !loading ? artifacts : [],
    loading: Boolean(autoStart && scope && runScope !== scope) || loading,
    activityLoading: scopedRun ? activityLoading : false,
    error: runScope === scope ? error : null,
    initialize,
    selectObjective,
    requestArtifact,
  };
}

export type ObjectiveLearningController = ReturnType<typeof useObjectiveLearning>;
