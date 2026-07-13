'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  appendUniqueArtifact,
  createAsyncRequestDeduper,
  createLearningScopeGuard,
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
  const scope = lessonId ? `${lessonId}:${mode}` : null;
  const scopedRun = runScope === scope ? run : null;

  const initialize = useCallback(async (requestedObjectiveId?: string | null) => {
    if (!lessonId) return null;
    const requestScope = `${lessonId}:${mode}`;
    const token = scopeGuardRef.current.begin(requestScope);
    setLoading(true);
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
      setArtifacts([]);
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
      if (scopeGuardRef.current.isCurrent(token)) setLoading(false);
    }
  }, [lessonId, mode]);

  useEffect(() => {
    scopeGuardRef.current.clear();
    if (!autoStart || !lessonId) return;
    const timeoutId = window.setTimeout(() => { void initialize(objectiveId); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [autoStart, initialize, lessonId, mode, objectiveId]);

  const selectObjective = useCallback(async (nextObjectiveId: string) => {
    if (!scopedRun) return false;
    setLoading(true);
    setError(null);
    try {
      const data = await readJson(await fetch(`/api/learning-runs/${scopedRun.id}/objective`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectiveId: nextObjectiveId }),
      }));
      setRun(data.run);
      setArtifacts([]);
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The objective could not be selected');
      return false;
    } finally {
      setLoading(false);
    }
  }, [scopedRun]);

  const requestArtifact = useCallback(async (
    kind: 'visualization' | 'quiz',
    requestId = crypto.randomUUID(),
    taskDescription?: string,
  ) => {
    if (!scopedRun) throw new Error('The objective learning session is not ready');
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
      setArtifacts((current) => appendUniqueArtifact(current, attachment));
      return attachment;
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'The learning activity could not be prepared';
      setError(message);
      throw requestError;
    } finally {
      setActivityLoading(false);
    }
  }, [scopedRun]);

  const activeObjective = useMemo(
    () => objectives.find((objective) => objective.id === scopedRun?.active_objective_id) ?? null,
    [objectives, scopedRun?.active_objective_id],
  );

  return {
    runId: scopedRun?.id ?? null,
    objectives: scopedRun ? objectives : [],
    activeObjective,
    artifacts: scopedRun ? artifacts : [],
    loading: Boolean(autoStart && scope && runScope !== scope) || loading,
    activityLoading: scopedRun ? activityLoading : false,
    error: runScope === scope ? error : null,
    initialize,
    selectObjective,
    requestArtifact,
  };
}

export type ObjectiveLearningController = ReturnType<typeof useObjectiveLearning>;
