'use client';

import { useEffect, useRef, useState, useCallback, useMemo, useReducer } from 'react';
import { toPng } from 'html-to-image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VoiceControl } from '@/components/voice/VoiceControl';
import { StartButtonOverlay } from '@/components/voice/StartButtonOverlay';
import { FeedbackForm, FeedbackData } from '@/components/feedback/FeedbackForm';
import { Loader2, X, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw, BookOpen, CircleHelp, Presentation, PenLine, Captions, CaptionsOff, SquareDashedMousePointer } from 'lucide-react';
import dynamic from 'next/dynamic';
import axios from 'axios';
import type { LessonContext, LiveTranscriptionPayload, VoiceCreditsUpdate } from '@/hooks/useAudioStreaming';
import { vizReducer, initialVizState, Visualization } from '@/reducers/visualizationReducer';
import type { ObjectiveLearningController } from '@/hooks/useObjectiveLearning';
import { normalizeRequestedArtifactKind } from '@/lib/lesson-artifacts/objective-learning-controller';
import { LearningArtifactCard } from '@/components/students/study-companion/LearningArtifactCard';
import { readVisualizationPanelDimensions } from '@/lib/visualization-viewport';
import { createRenderWaiter, type VisualStatusReport } from '@/lib/visual-status';
import { LearningActivityExpandSlot, LearningActivityToolbar } from '@/components/lessons/LearningActivityView';
import { boardReducer, initialBoardState, parseBoardItems, parseBoardTarget, parseBoardTitle, parseCheckpoint, parseCheckpointResult } from '@/lib/whiteboard/board';
import { formatBoardFrame, formatCheckpointResult, formatFrameQuestion, isWhiteboardToolName } from '@/lib/whiteboard/board-tools';
import { boardFontCss, cropDataUrl } from '@/lib/whiteboard/capture';
import type { BoardFrame } from '@/components/learn/whiteboard/Whiteboard';
import { captionReducer, initialCaptionState } from '@/lib/whiteboard/captions';
import { readWhiteboardPreference, saveWhiteboardPreference } from '@/lib/whiteboard/preference';
import { TutorCaptions } from '@/components/learn/whiteboard/TutorCaptions';

/** How long a new visual may take to render before the tutor is told it failed. */
const VISUAL_RENDER_TIMEOUT_MS = 30_000;

const ReactRenderer = dynamic(() => import('@/components/lessons/ReactRenderer').then(mod => mod.ReactRenderer), { ssr: false });
const LiveSketch = dynamic(() => import('@/components/lessons/LiveSketch').then(mod => mod.LiveSketch), { ssr: false });
const Whiteboard = dynamic(() => import('@/components/learn/whiteboard/Whiteboard').then(mod => mod.Whiteboard), { ssr: false });

/** How long a caption stays up after the tutor stops talking. */
const CAPTION_LINGER_MS = 6000;

/**
 * Shared interactive AI tutor experience. Both the embed (`InteractiveAITutor`,
 * API-key auth + credits) and the student (`StudentInteractiveAITutor`,
 * session auth + lesson context) variants render this with a small config.
 *
 * The single auth seam is `apiKey`: when set, requests carry
 * `Authorization: Bearer <apiKey>`; when null, they rely on the session cookie.
 */
export type TutorExperienceProps = {
  variant: 'embed' | 'student';
  apiKey: string | null;
  getFeedback: boolean;
  debugMode: boolean;
  initialTopic: string | null;
  lessonContext?: LessonContext;
  objectiveLearning?: ObjectiveLearningController;
  onSessionStarted?: (sessionId: string) => void;
  onSessionEnded?: (sessionId: string | null) => void;
  /** Where "back" goes, when not the student lesson page (e.g. a teacher rehearsing). */
  back?: { href: string; label: string };
  /**
   * Whiteboard mode. `true` or `false` fixes it (the embed's `whiteboard` URL
   * parameter); leave it out to let the learner choose on the start screen.
   */
  whiteboard?: boolean;
};

export const TutorExperience = ({
  variant,
  apiKey,
  getFeedback,
  debugMode,
  initialTopic,
  lessonContext,
  objectiveLearning,
  onSessionStarted,
  onSessionEnded,
  back,
  whiteboard: whiteboardFixed,
}: TutorExperienceProps) => {
  const creditsEnabled = variant === 'embed';
  const authHeaders: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  // Use reducer for visualization state to batch updates and reduce re-renders
  const [vizState, vizDispatch] = useReducer(vizReducer, initialVizState);
  const { code, library, visualizations, currentVizIndex, generatingVisualization } = vizState;

  // Whiteboard mode: the tutor writes on a board while it talks. Students get it
  // by default; the embed keeps its visual-first behaviour unless asked.
  const [whiteboardChoice, setWhiteboardChoice] = useState(variant === 'student');
  const whiteboardMode = whiteboardFixed ?? whiteboardChoice;
  const [board, boardDispatch] = useReducer(boardReducer, initialBoardState);
  const [panelView, setPanelView] = useState<'board' | 'activity'>('board');
  const [captions, captionDispatch] = useReducer(captionReducer, initialCaptionState);
  const [captionsOn, setCaptionsOn] = useState(true);
  const boardContentRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef(board);
  // Frame-to-ask: the learner drags a box over the board and asks about that part.
  const [framing, setFraming] = useState(false);
  const boardCaptureRef = useRef({ shown: false, revision: 0, busyUntil: 0, sentRevision: 0 });

  const [error, setError] = useState('');
  const [show, setShow] = useState<'render' | 'code'>('render');
  const [voiceActive, setVoiceActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [countdown, setCountdown] = useState(600);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackTrigger, setFeedbackTrigger] = useState<'manual_stop' | 'connection_reset' | 'error' | null>(null);
  const [topic, setTopic] = useState<string | null>(initialTopic);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(creditsEnabled);
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [, setSessionManuallyStopped] = useState(false);
  const vizRef = useRef<HTMLDivElement | null>(null);
  const vizOnlyRef = useRef<HTMLDivElement | null>(null);
  const isCapturingRef = useRef(false);
  const showRef = useRef<'render' | 'code'>('render');
  const regenerationAttemptsRef = useRef(0);
  // Resolves when the sandbox reports the current visual rendered or failed.
  const renderWaiterRef = useRef(createRenderWaiter());
  const MAX_REGENERATION_ATTEMPTS = 2;
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [themeColors, setThemeColors] = useState<{
    background: string;
    foreground: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    accent: string;
    muted: string;
    mutedForeground: string;
    border: string;
  } | null>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  const lastEndedSessionIdRef = useRef<string | null>(null);
  const handleVoiceStartupFailed = useCallback(() => setVoiceActive(false), []);

  const resetBoard = useCallback(() => {
    boardDispatch({ type: 'reset' });
    captionDispatch({ type: 'clear' });
    setPanelView('board');
    setFraming(false);
    boardCaptureRef.current.sentRevision = 0;
  }, []);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  // Messages to the tutor go through the same window events as the rest of the voice UI.
  const tellTutor = useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent('voice-send-text', { detail: text }));
  }, []);

  const handleAnswerCheckpoint = useCallback((id: string, chosen: number) => {
    const item = boardRef.current.pages.flatMap((page) => page.items).find((entry) => entry.id === id);
    if (!item || item.kind !== 'checkpoint' || item.result || item.correct === undefined || !item.choices?.[chosen]) return;
    boardDispatch({ type: 'answerCheckpoint', id, chosen });
    tellTutor(formatCheckpointResult({
      question: item.text,
      chosen: item.choices[chosen],
      correct: chosen === item.correct,
      rightAnswer: item.choices[item.correct],
    }));
  }, [tellTutor]);

  const handleFrame = useCallback(async (frame: BoardFrame) => {
    const content = boardContentRef.current;
    if (!content) return;
    try {
      const full = await toPng(content, {
        pixelRatio: 1,
        fontEmbedCSS: await boardFontCss(content),
        backgroundColor: document.documentElement.classList.contains('dark') ? '#18222d' : '#fdfcf7',
        filter: (node) => !(node instanceof HTMLElement && node.dataset.boardFrameUi !== undefined),
      });
      const cropped = await cropDataUrl(full, frame);
      if (cropped) window.dispatchEvent(new CustomEvent('voice-send-media', { detail: { dataUrl: cropped, mimeType: 'image/png' } }));
    } catch (err) {
      // The list of framed items below still tells the tutor what was picked.
      console.error('Failed to capture the framed part of the board', err);
    }
    tellTutor(formatBoardFrame(frame.items));
  }, [tellTutor]);

  const handleFrameQuestion = useCallback((question: string) => tellTutor(formatFrameQuestion(question)), [tellTutor]);
  const handleFrameClose = useCallback(() => setFraming(false), []);

  const handleBoardGoto = useCallback((index: number) => boardDispatch({ type: 'goto', index }), []);

  const handleWhiteboardChoice = useCallback((enabled: boolean) => {
    setWhiteboardChoice(enabled);
    saveWhiteboardPreference(enabled);
  }, []);

  // The learner's last choice wins over the default for this kind of tutor.
  useEffect(() => {
    const saved = readWhiteboardPreference();
    if (saved !== null) setWhiteboardChoice(saved);
  }, []);

  const handleTranscription = useCallback((payload: LiveTranscriptionPayload) => {
    // Captions follow the tutor; they clear when the learner speaks or cuts in.
    if (payload.role !== 'assistant' || payload.interrupted) captionDispatch({ type: 'clear' });
    else captionDispatch({ type: 'chunk', text: payload.text, finished: payload.finished });
  }, []);

  useEffect(() => {
    if (!captions.text) return;
    const timer = setTimeout(() => captionDispatch({ type: 'clear' }), CAPTION_LINGER_MS);
    return () => clearTimeout(timer);
  }, [captions.text]);

  const handleCountdownEnd = async () => {
    if (currentSessionId) {
      try {
        await axios.patch(`/api/learning/sessions/${currentSessionId}`,
          { status: 'ended', ended: true },
          { headers: authHeaders }
        );
        lastEndedSessionIdRef.current = currentSessionId;
        setCurrentSessionId(null);
      } catch (err) { console.error('Failed to persist session end on countdown', err) }
    }
    setVoiceActive(false);
    vizDispatch({ type: 'RESET' }); // Batch reset: code, library, visualizations, currentVizIndex
    resetBoard();
    setError('');
    setSessionManuallyStopped(true);
  };

  const handleVoiceStop = async () => {
    if (currentSessionId) {
      try {
        await axios.patch(`/api/learning/sessions/${currentSessionId}`,
          { status: 'ended', ended: true },
          { headers: authHeaders }
        );
      } catch (err) { console.error('Failed to persist session end on voice stop', err) }
      lastEndedSessionIdRef.current = currentSessionId;
      setCurrentSessionId(null);
    }
    setVoiceActive(false);
    vizDispatch({ type: 'RESET' }); // Batch reset all visualization state
    resetBoard();
    setError('');
    if (creditsEnabled) setShowCreditWarning(false);
    setSessionManuallyStopped(true);
  };

  const resetSessionState = useCallback(() => {
    // Stop any active voice session
    if (voiceActive) {
      handleVoiceStop();
    }

    vizDispatch({ type: 'RESET' }); // Batch reset all visualization state
    resetBoard();
    setError('');
    setTopic(lessonContext?.title || null);
    lastEndedSessionIdRef.current = currentSessionId;
    setCurrentSessionId(null);
    setShowFeedbackForm(getFeedback);
    setFeedbackTrigger(getFeedback ? 'manual_stop' : null);
    vizDispatch({ type: 'SET_GENERATING', payload: false });
    setSessionManuallyStopped(false);

    if (creditsEnabled) {
      setShowCreditWarning(false);
    }
  }, [voiceActive, handleVoiceStop, lessonContext, getFeedback, creditsEnabled]);

  const handleFeedbackFormChange = useCallback((show: boolean, trigger: 'manual_stop' | 'connection_reset' | 'error' | null) => {
    setShowFeedbackForm(show);
    setFeedbackTrigger(trigger);
  }, []);

  const handleFeedbackSubmit = async (feedback: FeedbackData) => {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...authHeaders,
      };
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...feedback,
          timestamp: new Date().toISOString(),
          sessionId: currentSessionId || lastEndedSessionIdRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
  };

  const handleFeedbackClose = () => {
    setShowFeedbackForm(false);
    setFeedbackTrigger(null);
  };

  const handleRegenerateVisualization = useCallback(async (isManualTrigger = true) => {
    if (objectiveLearning?.runId) {
      await objectiveLearning.requestArtifact('visualization', `manual:${objectiveLearning.runId}:${crypto.randomUUID()}`);
      return;
    }
    // Reset retry counter when manually triggered
    if (isManualTrigger) {
      regenerationAttemptsRef.current = 0;
    }

    if (currentVizIndex < 0 || currentVizIndex >= visualizations.length) return;
    const current = visualizations[currentVizIndex];
    const panelDimensions = readVisualizationPanelDimensions(vizOnlyRef.current);
    try {
      vizDispatch({ type: 'SET_GENERATING', payload: true });
      setError(''); // Clear previous error when regenerating
      const response = await fetch('/api/genai/visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ task_description: current.taskDescription || 'Regenerate visualization', panel_dimensions: panelDimensions, theme, theme_colors: themeColors, topic: lessonContext?.title || current.topic })
      });
      if (!response.ok) throw new Error('Failed to regenerate visualization');
      const vizData = await response.json();

      const updated: Visualization = { id: current.id, code: vizData.code, library: vizData.library, explanation: vizData.explanation, taskDescription: current.taskDescription, topic: current.topic, panelDimensions };
      // Use dispatch to batch update visualization and set current code/library
      vizDispatch({ type: 'UPDATE_VISUALIZATION', index: currentVizIndex, payload: updated });
      vizDispatch({ type: 'SET_CURRENT_VIZ', payload: { code: vizData.code, library: vizData.library, index: currentVizIndex } });

      if (current.id) {
        try {
          await axios.put(`/api/learning/visualizations/${current.id}`, {
            code: vizData.code,
            library: vizData.library,
            explanation: vizData.explanation ?? null,
            panel_dimensions: panelDimensions
          },
            { headers: authHeaders }
          );
        } catch (err) { console.error('Failed to persist regenerated visualization', err) }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to regenerate visualization');
      renderWaiterRef.current.failed(e.message || 'Failed to regenerate visualization');
    } finally {
      vizDispatch({ type: 'SET_GENERATING', payload: false });
    }
  }, [currentVizIndex, visualizations, apiKey, theme, themeColors, objectiveLearning, lessonContext])

  const handleRendererError = useCallback(async (errMsg: string) => {
    // Increment retry counter
    regenerationAttemptsRef.current += 1;

    // Check if we've exceeded the retry limit
    if (regenerationAttemptsRef.current > MAX_REGENERATION_ATTEMPTS) {
      setError(`Visualization failed to render after ${MAX_REGENERATION_ATTEMPTS} attempts. ${errMsg}`);
      console.error('Max regeneration attempts reached:', errMsg);
      renderWaiterRef.current.failed(errMsg);
      return;
    }

    try {
      // Don't show the intermediate error during auto-regeneration
      await handleRegenerateVisualization(false); // false = not manual trigger
    } catch (e: any) {
      setError(e.message || 'Failed to regenerate visualization');
    }
  }, [handleRegenerateVisualization]);

  const handleRendererReady = useCallback(() => {
    renderWaiterRef.current.ready();
  }, []);

  const handleSketchError = useCallback((errMsg: string) => {
    renderWaiterRef.current.failed(errMsg);
  }, []);

  const renderVisualization = useMemo(() => {
    if (!code || !library) return null;

    switch (library) {
      case 'react':
        return <ReactRenderer code={code} onError={handleRendererError} onReady={handleRendererReady} />;
      case 'p5':
      case 'three':
        return <LiveSketch code={code} library={library} onReady={handleRendererReady} onError={handleSketchError} />;
      default:
        return null;
    }
  }, [code, library, handleRendererError, handleRendererReady, handleSketchError]);

  const handleToolCall = async (name: string, args: any, callId?: string): Promise<VisualStatusReport | void> => {
    if (isWhiteboardToolName(name)) {
      if (!whiteboardMode) return;
      if (name === 'write_on_board') {
        const { items, ids } = parseBoardItems(args);
        if (items.length === 0) return;
        boardDispatch({ type: 'write', items, ids, now: Date.now() });
      } else if (name === 'highlight_on_board') {
        boardDispatch({ type: 'highlight', target: parseBoardTarget(args) });
      } else if (name === 'erase_from_board') {
        boardDispatch({ type: 'erase', target: parseBoardTarget(args) });
      } else if (name === 'ask_checkpoint') {
        const checkpoint = parseCheckpoint(args);
        if (!checkpoint) return;
        boardDispatch({ type: 'write', items: [checkpoint], now: Date.now() });
      } else if (name === 'mark_checkpoint') {
        const result = parseCheckpointResult(args);
        if (!result) return;
        boardDispatch({ type: 'markCheckpoint', result });
      } else {
        boardDispatch({ type: 'newBoard', title: parseBoardTitle(args) });
      }
      setPanelView('board');
      return;
    }
    if (name === 'request_learning_artifact' && objectiveLearning?.runId) {
      const taskDescription: string | undefined = typeof args?.taskDescription === 'string'
        ? args.taskDescription
        : typeof args?.task_description === 'string' ? args.task_description : undefined;
      try {
        const kind = normalizeRequestedArtifactKind(args?.kind);
        const requestId = callId
          ? `voice:${objectiveLearning.runId}:${callId}`
          : `voice:${objectiveLearning.runId}:${crypto.randomUUID()}`;
        const attachment = await objectiveLearning.requestArtifact(kind, requestId, taskDescription);
        setPanelView('activity');
        const title = typeof attachment?.artifact?.payload?.title === 'string' ? attachment.artifact.payload.title : undefined;
        const kindLabel = attachment?.artifact?.kind?.replace(/_/g, ' ') ?? kind;
        return { status: 'ready', taskDescription, explanation: title ? `${kindLabel}: "${title}"` : kindLabel };
      } catch (artifactError) {
        const message = artifactError instanceof Error ? artifactError.message : 'The learning activity could not be prepared';
        setError(message);
        return { status: 'failed', taskDescription, reason: message };
      }
    }
    if (name === 'generate_visualization_description') {
      vizDispatch({ type: 'SET_GENERATING', payload: true });
      setPanelView('activity');
      try {
        const panelDimensions = readVisualizationPanelDimensions(vizOnlyRef.current ?? vizRef.current?.querySelector('[data-visualization-panel]'));
        const vizTopic = lessonContext?.title || topic || undefined;

        const response = await fetch('/api/genai/visualize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            task_description: args.task_description,
            panel_dimensions: panelDimensions,
            theme,
            theme_colors: themeColors,
            topic: vizTopic,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to generate visualization');
        }

        const vizData = await response.json();
        regenerationAttemptsRef.current = 0; // Reset retry counter for new visualization
        setError(''); // Clear any previous error

        // Start waiting before the new code is set so the renderer's ready/error signal isn't missed.
        const rendered = renderWaiterRef.current.wait(VISUAL_RENDER_TIMEOUT_MS);
        // The tutor may have written on the board while this was generating, which
        // switches back to the board. The new visual has to be on screen to render.
        setPanelView('activity');
        // Use ADD_VISUALIZATION dispatch which sets code, library, visualizations, and currentVizIndex atomically
        vizDispatch({
          type: 'ADD_VISUALIZATION',
          payload: { code: vizData.code, library: vizData.library, explanation: vizData.explanation, taskDescription: args.task_description, topic: vizTopic, panelDimensions }
        });
        if (currentSessionId) {
          try {
            await axios.post('/api/learning/visualizations', {
              session_id: currentSessionId,
              library: vizData.library,
              explanation: vizData.explanation,
              code: vizData.code,
              panel_dimensions: panelDimensions,
              description: args.task_description,
              data: null,
            },
              { headers: authHeaders }
            );
          } catch (err) { console.error('Failed to persist generated visualization', err) }
        }
        vizDispatch({ type: 'SET_GENERATING', payload: false });
        const outcome = await rendered;
        return outcome.ok
          ? { status: 'ready', taskDescription: args.task_description, explanation: vizData.explanation }
          : { status: 'failed', taskDescription: args.task_description, reason: outcome.reason };
      } catch (e: any) {
        setError(e.message || 'Unknown error');
        return { status: 'failed', taskDescription: args?.task_description, reason: e.message || 'The visual could not be generated' };
      } finally {
        vizDispatch({ type: 'SET_GENERATING', payload: false });
      }
    }
    if (name === 'set_topic') {
      try {
        const t = typeof args?.topic === 'string' ? args.topic.trim() : '';
        if (t) {
          setTopic(t);
          if (currentSessionId) {
            try {
              await axios.patch(`/api/learning/sessions/${currentSessionId}`,
                { topic: t },
                { headers: authHeaders }
              );
            } catch (err) { console.error('Failed to persist session topic', err) }
          }
        }
      } catch (err) { console.error('Failed to handle set_topic tool call', err) }
    }
  };

  const canPrev = currentVizIndex > 0;
  const canNext = currentVizIndex >= 0 && currentVizIndex < visualizations.length - 1;
  const goPrev = () => {
    if (!canPrev) return;
    regenerationAttemptsRef.current = 0;
    setError('');
    vizDispatch({ type: 'SET_CURRENT_VIZ_INDEX', payload: currentVizIndex - 1 });
  };
  const goNext = () => {
    if (!canNext) return;
    regenerationAttemptsRef.current = 0;
    setError('');
    vizDispatch({ type: 'SET_CURRENT_VIZ_INDEX', payload: currentVizIndex + 1 });
  };

  // Keep a ref of the current view mode for the screenshot effect without re-creating the interval
  useEffect(() => {
    showRef.current = show;
  }, [show]);

  // Optimized screenshot capture using requestIdleCallback to prevent UI blocking
  useEffect(() => {
    if (connectionStatus !== 'connected') return;

    // Use a longer interval (5s) and requestIdleCallback to capture during idle time
    const SCREENSHOT_INTERVAL_MS = 5000;
    const IDLE_TIMEOUT_MS = 2000; // Max wait for idle before forcing capture

    const captureScreenshot = () => {
      // Skip screenshot when code view is active - Monaco DOM is heavy
      if (showRef.current === 'code') return;

      // The board only changes when the tutor writes, so its picture is sent
      // once per change, after the pen has stopped, instead of every few seconds.
      const boardCapture = boardCaptureRef.current;
      if (boardCapture.shown && (boardCapture.revision === boardCapture.sentRevision || Date.now() < boardCapture.busyUntil)) return;
      const container = (boardCapture.shown ? boardContentRef.current : vizOnlyRef.current) as HTMLElement | null;
      if (!container || isCapturingRef.current) return;

      // Check connection status again in case it changed
      if (connectionStatus !== 'connected') return;

      isCapturingRef.current = true;
      const capturedRevision = boardCapture.shown ? boardCapture.revision : null;

      (boardCapture.shown ? boardFontCss(container) : Promise.resolve(null)).then((fontCss) => toPng(container, {
        pixelRatio: 1,
        ...(boardCapture.shown
          ? { backgroundColor: document.documentElement.classList.contains('dark') ? '#18222d' : '#fdfcf7' }
          : {}),
        ...(fontCss === null ? { skipFonts: true } : { fontEmbedCSS: fontCss }),
        cacheBust: true,
        filter: (node) => {
          // Skip style elements (Monaco injects <style> not <link>)
          if (node && (node as HTMLElement).nodeName === 'STYLE') {
            return false;
          }

          // Skip external stylesheets that can cause cross-origin CSSRule access errors
          if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') {
            const href = node.href || '';
            if (href.startsWith('http') && !href.includes(window.location.hostname)) {
              return false;
            }
          }

          // The frame-to-ask box is the learner's pointer, not part of the board.
          if (node instanceof HTMLElement && node.dataset.boardFrameUi !== undefined) return false;

          // Skip Monaco Editor elements
          if (node instanceof Element) {
            if (
              node.classList?.contains('monaco-editor') ||
              node.classList?.contains('monaco-aria-container') ||
              node.closest?.('.monaco-editor') ||
              node.closest?.('[data-lesson-coding-workspace]')
            ) {
              return false;
            }
          }

          return true;
        },
      }))
        .then((dataUrl) => {
          window.dispatchEvent(new CustomEvent('voice-send-media', { detail: { dataUrl, mimeType: 'image/png' } }));
          if (capturedRevision !== null) boardCaptureRef.current.sentRevision = capturedRevision;
        })
        .catch(() => { })
        .finally(() => {
          isCapturingRef.current = false;
        });
    };

    const scheduleCapture = () => {
      // Use requestIdleCallback if available, otherwise use setTimeout as fallback
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(
          () => captureScreenshot(),
          { timeout: IDLE_TIMEOUT_MS }
        );
      } else {
        // Fallback for Safari - use setTimeout with a small delay
        setTimeout(captureScreenshot, 100);
      }
    };

    const id = setInterval(scheduleCapture, SCREENSHOT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [connectionStatus]);

  // Create session when connected
  useEffect(() => {
    if (connectionStatus === 'connected' && voiceActive && !currentSessionId) {
      (async () => {
        try {
          const body: Record<string, unknown> = { session_id: null, session_handle: null, topic };
          if (variant === 'student') {
            body.lessonId = lessonContext?.lessonId || null;
          }
          const res = await axios.post('/api/learning/sessions', body, { headers: authHeaders });
          setCurrentSessionId(res.data.id as string);
        } catch (err) { console.error('Failed to create learning session', err) }
      })();
    }
  }, [connectionStatus, voiceActive, currentSessionId, topic, lessonContext]);

  // Load existing visualizations for session
  useEffect(() => {
    const sid = currentSessionId;
    if (!sid) return;
    (async () => {
      try {
        const { data } = await axios.get(`/api/learning/visualizations?session_id=${sid}`,
          { headers: authHeaders }
        );
        const items = (data?.items || []) as any[];
        const mapped = items.map((row) => ({
          id: row.id as string,
          code: row.code as string,
          library: row.library as 'p5' | 'three' | 'react',
          explanation: row.explanation as string | undefined,
          taskDescription: (row.description || undefined) as string | undefined,
          panelDimensions: row.panel_dimensions || undefined,
        }));
        // Use LOAD_VISUALIZATIONS to atomically set visualizations, currentVizIndex, code, and library
        vizDispatch({ type: 'LOAD_VISUALIZATIONS', payload: mapped });
      } catch (err) { console.error('Failed to load session visualizations', err) }
    })();
  }, [currentSessionId]);

  // Handle disconnection
  useEffect(() => {
    if (connectionStatus === 'disconnected' && currentSessionId) {
      (async () => {
        try {
          await axios.patch(`/api/learning/sessions/${currentSessionId}`,
            { status: 'disconnected', ended: true },
            { headers: authHeaders }
          );
        } catch (err) { console.error('Failed to mark session disconnected', err) }
        lastEndedSessionIdRef.current = currentSessionId;
        setCurrentSessionId(null);
      })();
    }
  }, [connectionStatus, currentSessionId]);

  // Session lifecycle callbacks
  useEffect(() => {
    const previous = previousSessionIdRef.current;
    if (!previous && currentSessionId && onSessionStarted) {
      onSessionStarted(currentSessionId);
    }
    if (previous && !currentSessionId && onSessionEnded) {
      onSessionEnded(previous);
      if (getFeedback) {
        lastEndedSessionIdRef.current = previous;
        setShowFeedbackForm(true);
        setFeedbackTrigger('manual_stop');
      }
    }
    previousSessionIdRef.current = currentSessionId;
  }, [currentSessionId, onSessionEnded, onSessionStarted, getFeedback]);

  // Fetch initial credits (embed only)
  useEffect(() => {
    if (!creditsEnabled) return;
    const fetchCredits = async () => {
      try {
        setCreditsLoading(true);
        const response = await axios.get('/api/credits/status',
          { headers: authHeaders }
        );
        setCredits(response.data.credits);
      } catch (error) {
        console.error('Failed to fetch credits:', error);
        setCredits(null);
      }
      finally { setCreditsLoading(false); }
    };
    fetchCredits();
  }, []);

  // Listen for reset session events
  useEffect(() => {
    const handleResetSession = () => {
      resetSessionState();
    };

    window.addEventListener('resetSession', handleResetSession);
    return () => window.removeEventListener('resetSession', handleResetSession);
  }, [resetSessionState]);

  // Detect theme changes and extract actual colors
  useEffect(() => {
    const detectThemeAndColors = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');

      const computedStyle = getComputedStyle(document.documentElement);
      const getColor = (varName: string) => {
        const hsl = computedStyle.getPropertyValue(varName).trim();
        return hsl ? `hsl(${hsl})` : '';
      };

      setThemeColors({
        background: getColor('--background'),
        foreground: getColor('--foreground'),
        primary: getColor('--primary'),
        primaryForeground: getColor('--primary-foreground'),
        secondary: getColor('--secondary'),
        secondaryForeground: getColor('--secondary-foreground'),
        accent: getColor('--accent'),
        muted: getColor('--muted'),
        mutedForeground: getColor('--muted-foreground'),
        border: getColor('--border'),
      });
    };

    detectThemeAndColors();

    const observer = new MutationObserver(detectThemeAndColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Voice time is charged on the server in prepaid blocks when each voice
  // token is issued; this only keeps the balance on screen in sync.
  const handleCreditsUpdate = useCallback(({ remainingCredits }: VoiceCreditsUpdate) => {
    if (!creditsEnabled) return;
    setCredits(remainingCredits);
    window.dispatchEvent(new CustomEvent('creditUpdate', {
      detail: { credits: remainingCredits }
    }));
    if (remainingCredits <= 5) {
      setShowCreditWarning(true);
      setTimeout(() => setShowCreditWarning(false), 5000);
    }
  }, [creditsEnabled]);

  const lessonIndicator = (
    <div className="absolute top-3 left-3 right-3 z-20 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md border sm:top-4 sm:left-4 sm:right-auto sm:max-w-sm sm:px-4">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 shrink-0 text-primary" />
        <div className="min-w-0 break-words">
          <p className="text-sm font-medium">{lessonContext?.title}</p>
          {lessonContext?.subject && (
            <p className="text-xs text-muted-foreground">
              {lessonContext.subject} {lessonContext.gradeLevel && `• ${lessonContext.gradeLevel}`}
            </p>
          )}
          {lessonContext?.activeObjective && (
            <p className="mt-1 max-w-sm line-clamp-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Objective {lessonContext.activeObjective.position + 1}: {lessonContext.activeObjective.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  // Empty-state card header: lesson block (student w/ lesson) or generic title.
  const emptyStateHeader = lessonContext?.title ? (
    lessonIndicator
  ) : (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <CardTitle>Visualization</CardTitle>
      </div>
      <div className="flex items-center gap-2">
      </div>
    </div>
  );

  const currentObjectiveArtifact = objectiveLearning?.artifacts.at(-1);
  const preparingActivity = generatingVisualization || Boolean(objectiveLearning?.activityLoading);
  // In whiteboard mode the board is the main surface; a visual or quiz takes
  // the panel when one arrives, and the learner can flip between the two.
  const hasActivity = Boolean(currentObjectiveArtifact || (code && library) || preparingActivity);
  const showBoard = whiteboardMode && (panelView === 'board' || !hasActivity);
  const boardHasItems = (board.pages[board.current]?.items.length ?? 0) > 0;
  useEffect(() => {
    boardCaptureRef.current.shown = showBoard;
    boardCaptureRef.current.revision = board.revision;
    boardCaptureRef.current.busyUntil = board.busyUntil;
  }, [showBoard, board.revision, board.busyUntil]);
  // The board unmounts while an activity has the panel; mark its drawing as
  // finished so it doesn't replay from the start when the learner comes back.
  useEffect(() => {
    if (!showBoard) boardDispatch({ type: 'settle' });
  }, [showBoard]);
  const whiteboardToggle = whiteboardFixed === undefined ? { enabled: whiteboardChoice, onChange: handleWhiteboardChoice } : undefined;
  const studentBackHref = back?.href ?? (variant === 'student'
    ? (lessonContext?.lessonId ? `/students/lessons/${lessonContext.lessonId}` : '/students/dashboard')
    : undefined);
  const studentBackLabel = back?.label ?? (lessonContext?.lessonId ? 'Back to lesson' : 'Back to dashboard');
  const startOverlayVisible = (!voiceActive || connectionStatus !== 'connected') && !showFeedbackForm;
  // The start overlay already shows voice errors; don't repeat them behind it.
  const activityError = objectiveLearning?.error || (startOverlayVisible ? '' : error);
  const objectiveActivityControls = objectiveLearning?.runId ? (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button size="sm" className="min-h-11" variant="outline" disabled={objectiveLearning.loading || objectiveLearning.activityLoading} onClick={() => { setPanelView('activity'); void objectiveLearning.requestArtifact('visualization').catch(() => {}); }}>
        <Presentation className="mr-2 h-4 w-4" /> Show next visual
      </Button>
      <Button size="sm" className="min-h-11" variant="outline" disabled={objectiveLearning.loading || objectiveLearning.activityLoading} onClick={() => { setPanelView('activity'); void objectiveLearning.requestArtifact('quiz').catch(() => {}); }}>
        <CircleHelp className="mr-2 h-4 w-4" /> Start knowledge check
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex h-dvh min-h-0 min-w-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 relative overflow-hidden">
      {/* Lesson context indicator (student) */}
      {lessonContext?.title && !voiceActive && lessonIndicator}

      {startOverlayVisible && (
        <div className="absolute inset-0 z-30">
          {creditsEnabled ? (
            <StartButtonOverlay
              onStart={() => {
                setError('');
                setVoiceActive(true);
              }}
              error={error}
              backHref={studentBackHref}
              backLabel={studentBackLabel}
              connectionStatus={connectionStatus}
              creditsLoading={creditsLoading}
              outOfCredits={credits !== null && credits <= 0}
              remainingCredits={credits ?? undefined}
              whiteboard={whiteboardToggle}
            />
          ) : (
            <StartButtonOverlay
              onStart={() => {
                setError('');
                setVoiceActive(true);
              }}
              error={error}
              backHref={studentBackHref}
              backLabel={studentBackLabel}
              connectionStatus={connectionStatus}
              hideCredits={true}
              whiteboard={whiteboardToggle}
            />
          )}
        </div>
      )}
      <div data-visualization-viewport className="min-h-0 min-w-0 flex-1 flex flex-col overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]" ref={vizRef}>
        {showBoard ? (
          <Whiteboard
            board={board}
            onGoto={handleBoardGoto}
            contentRef={boardContentRef}
            onAnswerCheckpoint={handleAnswerCheckpoint}
            framing={framing}
            onFrame={handleFrame}
            onFrameQuestion={handleFrameQuestion}
            onFrameClose={handleFrameClose}
          />
        ) : currentObjectiveArtifact ? (
          <Card className="flex-1 overflow-y-auto rounded-none border-0 bg-background/95 shadow-none">
            <CardHeader className="sticky top-0 z-10 border-b bg-background/90 p-4 backdrop-blur sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Objective activity</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">Prepared for {lessonContext?.activeObjective?.text}</p>
                </div>
                {objectiveActivityControls}
              </div>
            </CardHeader>
            <CardContent className="mx-auto w-full max-w-5xl p-3 sm:p-6">
              {objectiveLearning?.activityLoading && <div className="mb-4 flex items-center gap-2 rounded-xl border bg-muted/50 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Preparing activity...</div>}
              {activityError && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{activityError}</div>}
              <LearningArtifactCard key={currentObjectiveArtifact.instanceId} attachment={currentObjectiveArtifact} />
            </CardContent>
          </Card>
        ) : code && library ? (
          <LearningActivityToolbar>
          <Card className="flex-1 flex flex-col bg-background/95 border-0 shadow-none rounded-none">
            <CardHeader>
              <div className="relative w-full z-10 flex flex-wrap items-center justify-end gap-2">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {debugMode && (
                    <ToggleGroup
                      type="single"
                      value={show}
                      onValueChange={(v: string | undefined) => v && setShow(v as 'render' | 'code')}
                    >
                      <ToggleGroupItem value="render">Rendering</ToggleGroupItem>
                      <ToggleGroupItem value="code">Code</ToggleGroupItem>
                    </ToggleGroup>
                  )}
                  <div className="flex items-center gap-2 bg-background/95">
                    {visualizations.length > 0 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Regenerate visualization"
                        aria-label="Regenerate visualization"
                        className="h-11 w-11"
                        onClick={() => handleRegenerateVisualization()}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    )}
                    {show === 'render' && <LearningActivityExpandSlot />}
                    {visualizations.length > 0 && (
                      <>
                      <Button size="icon" variant="ghost" className="group h-11 w-11 hover:bg-transparent" onClick={goPrev} disabled={!canPrev} title="Previous visualization" aria-label="Previous visualization">
                        <ChevronLeft className="w-4 h-4 transition-transform text-muted-foreground group-hover:text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" className="group h-11 w-11 hover:bg-transparent" onClick={goNext} disabled={!canNext} title="Next visualization" aria-label="Next visualization">
                        <ChevronRight className="w-4 h-4 transition-transform text-muted-foreground group-hover:text-primary" />
                      </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 relative">
              <div className="min-w-0 flex-1 p-3 space-y-4 sm:p-6">
                {!preparingActivity && (
                  <div
                    ref={vizOnlyRef}
                    data-visualization-panel
                    className="h-full w-full flex justify-center items-center"
                    style={{ display: show === 'render' ? 'flex' : 'none' }}
                  >
                    {renderVisualization}
                  </div>
                )}
                {!preparingActivity && show === 'code' && <pre className="h-full overflow-auto whitespace-pre-wrap rounded border p-3 text-sm"><code>{code}</code></pre>}
                {preparingActivity && (
                  <div className="h-full flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin mr-2" />
                    <div className="text-center text-muted-foreground">
                      <div className="text-lg mb-2">Preparing activity...</div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          </LearningActivityToolbar>
        ) : (
          preparingActivity ? (
            <Card className="flex-1 flex flex-col bg-background/95 border-0 shadow-none rounded-none">
              <CardHeader>
                {emptyStateHeader}
              </CardHeader>
              <CardContent data-visualization-panel className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6">
                <Loader2 className="w-10 h-10 animate-spin mr-2" />
                <div className="text-center text-muted-foreground">
                  <div className="text-lg mb-2">Preparing activity...</div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex-1 flex flex-col bg-background/95 border-0 shadow-none rounded-none">
              <CardHeader>
                {emptyStateHeader}
              </CardHeader>
              <CardContent data-visualization-panel className="flex-1 flex items-center justify-center p-3 sm:p-6">
                <div className="text-center text-muted-foreground">
                  {activityError && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{activityError}</div>}
                  <div className="text-lg mb-2">Ready for this objective</div>
                  <div className="mb-5 text-sm">Ask the tutor, open a reviewed visual, or start a knowledge check.</div>
                  {objectiveActivityControls}
                </div>
              </CardContent>
            </Card>
          )
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center w-full pb-[env(safe-area-inset-bottom)]">
        <VoiceControl
          active={voiceActive}
          viewportRef={vizRef}
          sessionId={currentSessionId}
          topic={topic}
          lessonContext={lessonContext}
          onError={setError}
          onStartupFailed={handleVoiceStartupFailed}
          onToolCall={handleToolCall}
          onConnectionStatusChange={setConnectionStatus}
          onCountdownEnd={handleCountdownEnd}
          onCountdownChange={setCountdown}
          onFeedbackFormChange={handleFeedbackFormChange}
          onFeedbackSubmit={handleFeedbackSubmit}
          onFeedbackClose={handleFeedbackClose}
          onCreditsUpdate={handleCreditsUpdate}
          whiteboard={whiteboardMode}
          onTranscription={whiteboardMode ? handleTranscription : undefined}
        />
      </div>

      {whiteboardMode && captionsOn && voiceActive && connectionStatus === 'connected' && <TutorCaptions text={captions.text} />}

      {voiceActive && connectionStatus === 'connected' && (
        <div className="absolute bottom-0 left-0 right-0 z-20 pb-[env(safe-area-inset-bottom)]">
          <div className="flex flex-col items-center py-3 px-4">
            {/* Controls */}
            <div className="flex items-center gap-4">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <Button
                type="button"
                size="icon"
                className="rounded-full bg-red-500 hover:bg-red-600 text-white w-12 h-12"
                onClick={handleVoiceStop}
                title="Disconnect"
                aria-label="Disconnect"
              >
                <X className="w-6 h-6" />
              </Button>
              <span className="text-sm font-mono text-muted-foreground">
                {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
              </span>
              {whiteboardMode && (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-11 w-11 rounded-full bg-background/90"
                  aria-pressed={captionsOn}
                  onClick={() => setCaptionsOn((on) => !on)}
                  title={captionsOn ? 'Hide captions' : 'Show captions'}
                  aria-label={captionsOn ? 'Hide captions' : 'Show captions'}
                >
                  {captionsOn ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}
                </Button>
              )}
              {showBoard && boardHasItems && (
                <Button
                  type="button"
                  size="icon"
                  variant={framing ? 'default' : 'outline'}
                  className={`h-11 w-11 rounded-full ${framing ? '' : 'bg-background/90'}`}
                  aria-pressed={framing}
                  onClick={() => setFraming((on) => !on)}
                  title={framing ? 'Stop asking about a part' : 'Ask about part of the board'}
                  aria-label={framing ? 'Stop asking about a part' : 'Ask about part of the board'}
                >
                  <SquareDashedMousePointer className="h-5 w-5" />
                </Button>
              )}
              {whiteboardMode && hasActivity && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-full bg-background/90 px-4"
                  onClick={() => setPanelView(showBoard ? 'activity' : 'board')}
                >
                  {showBoard ? <Presentation className="mr-2 h-4 w-4" /> : <PenLine className="mr-2 h-4 w-4" />}
                  {showBoard ? 'Activity' : 'Board'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Feedback Form - positioned relative to main content only */}
      {
        showFeedbackForm && feedbackTrigger && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
            <FeedbackForm
              isOpen={showFeedbackForm}
              onClose={handleFeedbackClose}
              onSubmit={handleFeedbackSubmit}
              trigger={feedbackTrigger}
              noOverlay={true}
            />
          </div>
        )
      }
      {/* Credit Warning (embed only) */}
      {
        creditsEnabled && showCreditWarning && (
          <div className="absolute top-4 left-1/2 w-[calc(100%-1.5rem)] max-w-md transform -translate-x-1/2 z-50">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-lg max-w-md">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">
                    {typeof credits === 'number'
                      ? (credits <= 0 ? 'No credits remaining!' : `Only ${credits} credits left!`)
                      : 'Checking credits...'}
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    {typeof credits === 'number'
                      ? (credits <= 0
                        ? 'Purchase credits to continue learning.'
                        : `≈ ${credits} minutes of AI time remaining`)
                      : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => window.open('/learn/credits', '_blank')}
                  className="ml-auto"
                >
                  Buy Credits
                </Button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};
