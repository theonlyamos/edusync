'use client';

import { useEffect, useRef, useState, Suspense, useCallback, useMemo } from 'react';
import { toPng } from 'html-to-image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VoiceControl } from '@/components/voice/VoiceControl';
import { StartButtonOverlay } from '@/components/voice/StartButtonOverlay';
import { FeedbackForm, FeedbackData } from '@/components/feedback/FeedbackForm';
import { Loader2, X, ChevronLeft, ChevronRight, RefreshCw, BookOpen } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import axios from 'axios';
import { LessonContext } from '@/hooks/useAudioStreaming';

const Editor = dynamic(() => import('@/components/lessons/CodeEditor').then(mod => mod.CodeEditor), { ssr: false });
const ReactRenderer = dynamic(() => import('@/components/lessons/ReactRenderer').then(mod => mod.ReactRenderer), { ssr: false });
const LiveSketch = dynamic(() => import('@/components/lessons/LiveSketch').then(mod => mod.LiveSketch), { ssr: false });

type Visualization = {
  id?: string;
  code: string;
  library: 'p5' | 'three' | 'react';
  explanation?: string;
  taskDescription?: string;
  panelDimensions?: { width: number; height: number }
};

type StudentInteractiveAITutorProps = {
  onSessionStarted?: (sessionId: string) => void;
  onSessionEnded?: (sessionId: string | null) => void;
  initialLessonContext?: LessonContext;
};

export const StudentInteractiveAITutorComponent = ({ onSessionStarted, onSessionEnded, initialLessonContext }: StudentInteractiveAITutorProps) => {
  const searchParams = useSearchParams();
  const debugMode = searchParams.get('debug') === 'true';
  const getFeedback = searchParams.get('getFeedback') === 'true';
  
  // Parse lesson context from URL params
  const lessonIdFromUrl = searchParams.get('lessonId');
  const lessonTitleFromUrl = searchParams.get('lessonTitle');
  const lessonSubjectFromUrl = searchParams.get('lessonSubject');
  const lessonGradeFromUrl = searchParams.get('lessonGrade');
  const lessonObjectivesFromUrl = searchParams.get('lessonObjectives');
  
  const [code, setCode] = useState('');
  const [library, setLibrary] = useState<'p5' | 'three' | 'react' | null>(null);
  const [visualizations, setVisualizations] = useState<Visualization[]>([]);
  const [currentVizIndex, setCurrentVizIndex] = useState<number>(-1);
  const [error, setError] = useState('');
  const [show, setShow] = useState<'render' | 'code'>('render');
  const [voiceActive, setVoiceActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [countdown, setCountdown] = useState(600);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackTrigger, setFeedbackTrigger] = useState<'manual_stop' | 'connection_reset' | 'error' | null>(null);
  const [generatingVisualization, setGeneratingVisualization] = useState(false);
  const [topic, setTopic] = useState<string | null>(lessonTitleFromUrl || initialLessonContext?.title || null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionManuallyStopped, setSessionManuallyStopped] = useState(false);
  const [lessonContext, setLessonContext] = useState<LessonContext | undefined>(initialLessonContext);
  const [lessonLoading, setLessonLoading] = useState(!!lessonIdFromUrl);
  
  const vizRef = useRef<HTMLDivElement | null>(null);
  const isCapturingRef = useRef(false);
  const regenerationAttemptsRef = useRef(0);
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

  // Fetch lesson content if lessonId is provided
  useEffect(() => {
    const fetchLessonContent = async () => {
      if (!lessonIdFromUrl) {
        setLessonLoading(false);
        return;
      }
      
      try {
        setLessonLoading(true);
        const response = await fetch(`/api/lessons/${lessonIdFromUrl}`);
        if (response.ok) {
          const lesson = await response.json();
          const context: LessonContext = {
            lessonId: lessonIdFromUrl,
            title: lesson.title,
            subject: lesson.subject,
            gradeLevel: lesson.gradelevel,
            objectives: lesson.objectives,
            content: lesson.content,
          };
          setLessonContext(context);
          if (lesson.title && !topic) {
            setTopic(lesson.title);
          }
        }
      } catch (error) {
        console.error('Failed to fetch lesson:', error);
        // Fall back to URL params if fetch fails
        if (lessonTitleFromUrl) {
          setLessonContext({
            lessonId: lessonIdFromUrl,
            title: lessonTitleFromUrl,
            subject: lessonSubjectFromUrl || undefined,
            gradeLevel: lessonGradeFromUrl || undefined,
            objectives: lessonObjectivesFromUrl || undefined,
          });
        }
      } finally {
        setLessonLoading(false);
      }
    };

    fetchLessonContent();
  }, [lessonIdFromUrl]);

  const handleCountdownEnd = async () => {
    if (currentSessionId) {
      try {
        await axios.patch(`/api/learning/sessions/${currentSessionId}`,
          { status: 'ended', ended: true }
        );
        lastEndedSessionIdRef.current = currentSessionId;
        setCurrentSessionId(null);
      } catch { }
    }
    setVoiceActive(false);
    setCode('');
    setLibrary(null);
    setVisualizations([]);
    setCurrentVizIndex(-1);
    setError('');
    setSessionManuallyStopped(true);
  };

  const handleVoiceStop = async () => {
    if (currentSessionId) {
      try {
        await axios.patch(`/api/learning/sessions/${currentSessionId}`,
          { status: 'ended', ended: true }
        );
      } catch { }
      lastEndedSessionIdRef.current = currentSessionId;
      setCurrentSessionId(null);
    }
    setVoiceActive(false);
    setCode('');
    setLibrary(null);
    setVisualizations([]);
    setCurrentVizIndex(-1);
    setError('');
    setSessionManuallyStopped(true);
  };

  const resetSessionState = useCallback(() => {
    if (voiceActive) {
      handleVoiceStop();
    }

    setCode('');
    setLibrary(null);
    setVisualizations([]);
    setCurrentVizIndex(-1);
    setError('');
    setTopic(lessonContext?.title || null);
    lastEndedSessionIdRef.current = currentSessionId;
    setCurrentSessionId(null);
    setShowFeedbackForm(getFeedback);
    setFeedbackTrigger(getFeedback ? 'manual_stop' : null);
    setGeneratingVisualization(false);
    setSessionManuallyStopped(false);
  }, [voiceActive, handleVoiceStop, lessonContext]);

  const handleFeedbackFormChange = useCallback((show: boolean, trigger: 'manual_stop' | 'connection_reset' | 'error' | null) => {
    setShowFeedbackForm(show);
    setFeedbackTrigger(trigger);
  }, []);

  const handleFeedbackSubmit = async (feedback: FeedbackData) => {
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    if (isManualTrigger) {
      regenerationAttemptsRef.current = 0;
    }

    if (currentVizIndex < 0 || currentVizIndex >= visualizations.length) return;
    const current = visualizations[currentVizIndex];
    const panelElement = vizRef.current;
    let panelDimensions = { width: 800, height: 600 };
    if (panelElement) {
      const rect = panelElement.getBoundingClientRect();
      panelDimensions = { width: Math.floor(rect.width), height: Math.floor(rect.height) };
    }
    try {
      setGeneratingVisualization(true);
      setError('');
      const response = await fetch('/api/genai/visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_description: current.taskDescription || 'Regenerate visualization', panel_dimensions: panelDimensions, theme, theme_colors: themeColors })
      });
      if (!response.ok) throw new Error('Failed to regenerate visualization');
      const vizData = await response.json();

      const updated: Visualization = { id: current.id, code: vizData.code, library: vizData.library, explanation: vizData.explanation, taskDescription: current.taskDescription, panelDimensions };
      setVisualizations(prev => {
        const next = [...prev];
        next[currentVizIndex] = updated;
        return next;
      });
      setCode(vizData.code);
      setLibrary(vizData.library);

      if (current.id) {
        try {
          await axios.put(`/api/learning/visualizations/${current.id}`, {
            code: vizData.code,
            library: vizData.library,
            explanation: vizData.explanation ?? null,
            panel_dimensions: panelDimensions
          });
        } catch { }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to regenerate visualization');
    } finally {
      setGeneratingVisualization(false);
    }
  }, [currentVizIndex, visualizations, theme, themeColors])

  const handleRendererError = useCallback(async (errMsg: string) => {
    regenerationAttemptsRef.current += 1;

    if (regenerationAttemptsRef.current > MAX_REGENERATION_ATTEMPTS) {
      setError(`Visualization failed to render after ${MAX_REGENERATION_ATTEMPTS} attempts. ${errMsg}`);
      console.error('Max regeneration attempts reached:', errMsg);
      return;
    }

    try {
      await handleRegenerateVisualization(false);
    } catch (e: any) {
      setError(e.message || 'Failed to regenerate visualization');
    }
  }, [handleRegenerateVisualization]);

  const renderVisualization = useMemo(() => {
    if (!code || !library) return null;

    switch (library) {
      case 'react':
        return <ReactRenderer code={code} onError={handleRendererError} />;
      case 'p5':
      case 'three':
        return <LiveSketch code={code} library={library} />;
      default:
        return null;
    }
  }, [code, library, handleRendererError]);

  const handleToolCall = async (name: string, args: any) => {
    if (name === 'generate_visualization_description') {
      setGeneratingVisualization(true);
      try {
        const panelElement = vizRef.current;
        let panelDimensions = { width: 800, height: 600 };

        if (panelElement) {
          const rect = panelElement.getBoundingClientRect();
          panelDimensions = {
            width: Math.floor(rect.width),
            height: Math.floor(rect.height)
          };
        }

        const response = await fetch('/api/genai/visualize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_description: args.task_description,
            panel_dimensions: panelDimensions,
            theme,
            theme_colors: themeColors
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to generate visualization');
        }

        const vizData = await response.json();
        regenerationAttemptsRef.current = 0;
        setError('');
        setCode(vizData.code);
        setLibrary(vizData.library);
        setVisualizations(prev => {
          const next = [...prev, { code: vizData.code, library: vizData.library, explanation: vizData.explanation, taskDescription: args.task_description, panelDimensions }];
          setCurrentVizIndex(next.length - 1);
          return next;
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
            });
          } catch { }
        }
      } catch (e: any) {
        setError(e.message || 'Unknown error');
      } finally {
        setGeneratingVisualization(false);
      }
    }
    if (name === 'set_topic') {
      try {
        const t = typeof args?.topic === 'string' ? args.topic.trim() : '';
        if (t) {
          setTopic(t);
          if (currentSessionId) {
            try {
              await axios.patch(`/api/learning/sessions/${currentSessionId}`, { topic: t });
            } catch { }
          }
        }
      } catch { }
    }
  };

  const canPrev = currentVizIndex > 0;
  const canNext = currentVizIndex >= 0 && currentVizIndex < visualizations.length - 1;
  const goPrev = () => {
    if (!canPrev) return;
    regenerationAttemptsRef.current = 0;
    setError('');
    const idx = currentVizIndex - 1;
    setCurrentVizIndex(idx);
    const v = visualizations[idx];
    setCode(v.code);
    setLibrary(v.library);
  };
  const goNext = () => {
    if (!canNext) return;
    regenerationAttemptsRef.current = 0;
    setError('');
    const idx = currentVizIndex + 1;
    setCurrentVizIndex(idx);
    const v = visualizations[idx];
    setCode(v.code);
    setLibrary(v.library);
  };

  // Capture and send visualization screenshots
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    const id = setInterval(() => {
      const container = vizRef.current as HTMLElement | null;
      if (!container || isCapturingRef.current) return;
      isCapturingRef.current = true;
      toPng(container, { pixelRatio: 1 })
        .then((dataUrl) => {
          window.dispatchEvent(new CustomEvent('voice-send-media', { detail: { dataUrl, mimeType: 'image/png' } }));
        })
        .catch(() => { })
        .finally(() => {
          isCapturingRef.current = false;
        });
    }, 3000);
    return () => clearInterval(id);
  }, [connectionStatus, show, code, library]);

  // Create session when connected
  useEffect(() => {
    if (connectionStatus === 'connected' && voiceActive && !currentSessionId) {
      (async () => {
        try {
          const res = await axios.post('/api/learning/sessions', {
            session_id: null,
            session_handle: null,
            topic,
            lessonId: lessonContext?.lessonId || null
          });
          setCurrentSessionId(res.data.id as string);
        } catch { }
      })();
    }
  }, [connectionStatus, voiceActive, currentSessionId, topic, lessonContext]);

  // Load existing visualizations for session
  useEffect(() => {
    const sid = currentSessionId;
    if (!sid) return;
    (async () => {
      try {
        const { data } = await axios.get(`/api/learning/visualizations?session_id=${sid}`);
        const items = (data?.items || []) as any[];
        const mapped = items.map((row) => ({
          id: row.id as string,
          code: row.code as string,
          library: row.library as 'p5' | 'three' | 'react',
          explanation: row.explanation as string | undefined,
          taskDescription: (row.description || undefined) as string | undefined,
          panelDimensions: row.panel_dimensions || undefined,
        }));
        setVisualizations(mapped);
        if (mapped.length > 0) {
          setCurrentVizIndex(0);
          setCode(mapped[0].code);
          setLibrary(mapped[0].library);
        }
      } catch { }
    })();
  }, [currentSessionId]);

  // Handle disconnection
  useEffect(() => {
    if (connectionStatus === 'disconnected' && currentSessionId) {
      (async () => {
        try {
          await axios.patch(`/api/learning/sessions/${currentSessionId}`,
            { status: 'disconnected', ended: true }
          );
        } catch { }
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

  // Listen for reset session events
  useEffect(() => {
    const handleResetSession = () => {
      resetSessionState();
    };

    window.addEventListener('resetSession', handleResetSession);
    return () => window.removeEventListener('resetSession', handleResetSession);
  }, [resetSessionState]);

  // Detect theme changes
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

  // Show loading state while fetching lesson
  if (lessonLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading lesson...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 relative overflow-hidden">
      {/* Lesson context indicator */}
      {lessonContext?.title && !voiceActive && (
        <div className="absolute top-4 left-4 z-20 bg-background/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-md border">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <div>
              <p className="text-sm font-medium">{lessonContext.title}</p>
              {lessonContext.subject && (
                <p className="text-xs text-muted-foreground">
                  {lessonContext.subject} {lessonContext.gradeLevel && `• ${lessonContext.gradeLevel}`}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {(!voiceActive || (voiceActive && connectionStatus !== 'connected')) && !showFeedbackForm && (
        <div className="absolute inset-0 z-30">
          <StartButtonOverlay
            onStart={() => {
              setVoiceActive(true);
            }}
            connectionStatus={connectionStatus}
            hideCredits={true}
          />
        </div>
      )}
      <div className="flex-1 flex flex-col ml-0 lg:min-w-0 overflow-y-auto" ref={vizRef}>
        {code && library ? (
          <Card className="flex-1 flex flex-col bg-background/95 border-0 shadow-none rounded-none">
            <CardHeader>
              <div className="absolute left-0 px-8 w-full z-10 flex items-center justify-end">
                <div className="flex items-center gap-2">
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
                  {visualizations.length > 0 && (
                    <div className="flex items-center gap-2 bg-background/95">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Regenerate visualization"
                        onClick={() => handleRegenerateVisualization()}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="group hover:bg-transparent" onClick={goPrev} disabled={!canPrev} title="Previous visualization">
                        <ChevronLeft className="w-4 h-4 transition-transform text-muted-foreground group-hover:text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" className="group hover:bg-transparent" onClick={goNext} disabled={!canNext} title="Next visualization">
                        <ChevronRight className="w-4 h-4 transition-transform text-muted-foreground group-hover:text-primary" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 relative">
              <div className="flex-1 p-6">
                {show === 'render' && (
                  !generatingVisualization ? (
                    <div className="h-full w-full flex justify-center items-center">
                      {renderVisualization}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center">
                      <Loader2 className="w-10 h-10 animate-spin mr-2" />
                      <div className="text-center text-muted-foreground">
                        <div className="text-lg mb-2">Generating visualization...</div>
                      </div>
                    </div>
                  )
                )}
                {show === 'code' && (
                  !generatingVisualization ? (
                    <div className="h-full">
                      <Editor
                        data={{
                          initialCode: code,
                          language: library === 'react' ? 'javascript' : 'javascript',
                          tests: [],
                        }}
                        onSubmit={() => { }}
                      />
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center">
                      <Loader2 className="w-10 h-10 animate-spin mr-2" />
                      <div className="text-center text-muted-foreground">
                        <div className="text-lg mb-2">Generating visualization...</div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          generatingVisualization ? (
            <Card className="flex-1 flex flex-col bg-background/95 border-0 shadow-none rounded-none">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle>Visualization</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin mr-2" />
                <div className="text-center text-muted-foreground">
                  <div className="text-lg mb-2">Generating visualization...</div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex-1 flex flex-col bg-background/95 border-0 shadow-none rounded-none">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle>Visualization</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <div className="text-lg mb-2">No visualization yet</div>
                  <div className="text-sm">Ask a question to generate a visualization, quiz, or interactive component</div>
                </div>
              </CardContent>
            </Card>
          )
        )}
      </div>
      <div className={`fixed bottom-0 left-0 right-0 z-50 flex justify-center w-full`}>
        <VoiceControl
          active={voiceActive}
          sessionId={currentSessionId}
          topic={topic}
          lessonContext={lessonContext}
          onError={setError}
          onToolCall={handleToolCall}
          onConnectionStatusChange={setConnectionStatus}
          onCountdownEnd={handleCountdownEnd}
          onCountdownChange={setCountdown}
          onFeedbackFormChange={handleFeedbackFormChange}
          onFeedbackSubmit={handleFeedbackSubmit}
          onFeedbackClose={handleFeedbackClose}
        />
      </div>

      {voiceActive && connectionStatus === 'connected' && (
        <div className={`fixed bottom-0 left-0 right-0 z-50`}>
          <div className="flex flex-col items-center py-3 px-4">
            <div className="w-full max-w-sm h-8 max-h-12 mb-3 mx-auto" id="mobile-visualizer-container">
            </div>

            <div className="flex items-center gap-4">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <Button
                type="button"
                size="icon"
                className="rounded-full bg-red-500 hover:bg-red-600 text-white w-12 h-12"
                onClick={handleVoiceStop}
                title="Disconnect"
              >
                <X className="w-6 h-6" />
              </Button>
              <span className="text-sm font-mono text-muted-foreground">
                {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>
      )}

      {showFeedbackForm && feedbackTrigger && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10 p-4 lg:left-20">
          <FeedbackForm
            isOpen={showFeedbackForm}
            onClose={handleFeedbackClose}
            onSubmit={handleFeedbackSubmit}
            trigger={feedbackTrigger}
            noOverlay={true}
          />
        </div>
      )}
    </div>
  );
}

export default function StudentInteractiveAITutor(props: StudentInteractiveAITutorProps) {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="w-12 h-12 animate-spin" /></div>}>
      <StudentInteractiveAITutorComponent {...props} />
    </Suspense>
  );
}
