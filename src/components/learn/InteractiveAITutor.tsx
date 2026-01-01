'use client';

import { useEffect, useRef, useState, Suspense, useCallback, useMemo, useContext } from 'react';
import { toPng } from 'html-to-image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VoiceControl } from '@/components/voice/VoiceControl';
import { StartButtonOverlay } from '@/components/voice/StartButtonOverlay';
import { FeedbackForm, FeedbackData } from '@/components/feedback/FeedbackForm';
import { Loader2, Send, StopCircle, X, ChevronLeft, ChevronRight, AlertTriangle, MessageSquare, PanelLeftClose, PanelRightClose, RefreshCw } from 'lucide-react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import axios from 'axios';

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

type InteractiveAITutorProps = {
  onSessionStarted?: (sessionId: string) => void;
  onSessionEnded?: (sessionId: string | null) => void;
};

export const InteractiveAITutorComponent = ({ onSessionStarted, onSessionEnded }: InteractiveAITutorProps) => {
  const searchParams = useSearchParams();
  const apiKey = searchParams.get('apiKey');
  const topicFromUrl = searchParams.get('topic');
  const debugMode = searchParams.get('debug') === 'true';
  const getFeedback = searchParams.get('getFeedback') === 'true';
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
  const [topic, setTopic] = useState<string | null>(topicFromUrl);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [creditDeductionInterval, setCreditDeductionInterval] = useState<NodeJS.Timeout | null>(null);
  const [sessionManuallyStopped, setSessionManuallyStopped] = useState(false);
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

  const handleCountdownEnd = async () => {
    if (currentSessionId) {
      try {
        await axios.patch(`/api/learning/sessions/${currentSessionId}`,
          { status: 'ended', ended: true },
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} }
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
    // Clear credit deduction interval
    if (creditDeductionInterval) {
      clearInterval(creditDeductionInterval);
      setCreditDeductionInterval(null);
    }

    if (currentSessionId) {
      try {
        await axios.patch(`/api/learning/sessions/${currentSessionId}`,
          { status: 'ended', ended: true },
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} }
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
    setShowCreditWarning(false);
    setSessionManuallyStopped(true);
  };

  const resetSessionState = useCallback(() => {
    // Stop any active voice session
    if (voiceActive) {
      handleVoiceStop();
    }

    setCode('');
    setLibrary(null);
    setVisualizations([]);
    setCurrentVizIndex(-1);
    setError('');
    setTopic(null);
    lastEndedSessionIdRef.current = currentSessionId;
    setCurrentSessionId(null);
    setShowFeedbackForm(getFeedback);
    setFeedbackTrigger(getFeedback ? 'manual_stop' : null);
    setGeneratingVisualization(false);
    setShowCreditWarning(false);
    setSessionManuallyStopped(false);

    // Clear any intervals
    if (creditDeductionInterval) {
      clearInterval(creditDeductionInterval);
      setCreditDeductionInterval(null);
    }
  }, [voiceActive, handleVoiceStop, creditDeductionInterval]);

  const handleFeedbackFormChange = useCallback((show: boolean, trigger: 'manual_stop' | 'connection_reset' | 'error' | null) => {
    setShowFeedbackForm(show);
    setFeedbackTrigger(trigger);
  }, []);

  const handleFeedbackSubmit = async (feedback: FeedbackData) => {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
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

      console.log('Feedback submitted successfully');
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
  };

  const handleFeedbackClose = () => {
    setShowFeedbackForm(false);
    setFeedbackTrigger(null);
  };

  const getLibraryDisplayName = () => {
    switch (library) {
      case 'p5': return 'p5.js';
      case 'three': return 'Three.js';
      case 'react': return 'React';
      default: return 'Visualization';
    }
  };

  const handleRegenerateVisualization = useCallback(async (isManualTrigger = true) => {
    // Reset retry counter when manually triggered
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
      setError(''); // Clear previous error when regenerating
      const response = await fetch('/api/genai/visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
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
          },
            { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} }
          );
        } catch { }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to regenerate visualization');
    } finally {
      setGeneratingVisualization(false);
    }
  }, [currentVizIndex, visualizations, apiKey, theme, themeColors])

  const handleRendererError = useCallback(async (errMsg: string) => {
    // Increment retry counter
    regenerationAttemptsRef.current += 1;

    // Check if we've exceeded the retry limit
    if (regenerationAttemptsRef.current > MAX_REGENERATION_ATTEMPTS) {
      setError(`Visualization failed to render after ${MAX_REGENERATION_ATTEMPTS} attempts. ${errMsg}`);
      console.error('Max regeneration attempts reached:', errMsg);
      return;
    }

    console.log(`Regeneration attempt ${regenerationAttemptsRef.current}/${MAX_REGENERATION_ATTEMPTS} due to error:`, errMsg);

    try {
      // Don't show the intermediate error during auto-regeneration
      await handleRegenerateVisualization(false); // false = not manual trigger
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
        // Get panel dimensions
        const panelElement = vizRef.current;
        let panelDimensions = { width: 800, height: 600 }; // Default dimensions

        if (panelElement) {
          const rect = panelElement.getBoundingClientRect();
          panelDimensions = {
            width: Math.floor(rect.width),
            height: Math.floor(rect.height)
          };
        }

        const response = await fetch('/api/genai/visualize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
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
        regenerationAttemptsRef.current = 0; // Reset retry counter for new visualization
        setError(''); // Clear any previous error
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
            },
              { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} }
            );
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
        console.log('set_topic', t, currentSessionId);
        if (t) {
          setTopic(t);
          if (currentSessionId) {
            try {
              await axios.patch(`/api/learning/sessions/${currentSessionId}`,
                { topic: t },
                { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} }
              );
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
    regenerationAttemptsRef.current = 0; // Reset retry counter when navigating
    setError(''); // Clear any previous error
    const idx = currentVizIndex - 1;
    setCurrentVizIndex(idx);
    const v = visualizations[idx];
    setCode(v.code);
    setLibrary(v.library);
  };
  const goNext = () => {
    if (!canNext) return;
    regenerationAttemptsRef.current = 0; // Reset retry counter when navigating
    setError(''); // Clear any previous error
    const idx = currentVizIndex + 1;
    setCurrentVizIndex(idx);
    const v = visualizations[idx];
    setCode(v.code);
    setLibrary(v.library);
  };

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

  useEffect(() => {
    if (connectionStatus === 'connected' && voiceActive && !currentSessionId) {
      (async () => {
        try {
          const res = await axios.post('/api/learning/sessions',
            { session_id: null, session_handle: null, topic },
            { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} }
          );
          setCurrentSessionId(res.data.id as string);
        } catch { }
      })();
    }
  }, [connectionStatus, voiceActive, currentSessionId, topic]);

  useEffect(() => {
    const sid = currentSessionId;
    if (!sid) return;
    (async () => {
      try {
        const { data } = await axios.get(`/api/learning/visualizations?session_id=${sid}`,
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} }
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
        setVisualizations(mapped);
        if (mapped.length > 0) {
          setCurrentVizIndex(0);
          setCode(mapped[0].code);
          setLibrary(mapped[0].library);
        }
      } catch { }
    })();
  }, [currentSessionId]);

  useEffect(() => {
    if (connectionStatus === 'disconnected' && currentSessionId) {
      (async () => {
        try {
          await axios.patch(`/api/learning/sessions/${currentSessionId}`,
            { status: 'disconnected', ended: true },
            { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} }
          );
        } catch { }
        lastEndedSessionIdRef.current = currentSessionId;
        setCurrentSessionId(null);
      })();
    }
  }, [connectionStatus, currentSessionId]);

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

  // Fetch initial credits
  useEffect(() => {
    const fetchCredits = async () => {
      try {
        setCreditsLoading(true);
        const response = await axios.get('/api/credits/status',
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} }
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

  // Start credit deduction when voice becomes active and connected
  useEffect(() => {
    if (connectionStatus === 'connected' && voiceActive && currentSessionId && !creditDeductionInterval) {
      if (credits === null || creditsLoading) {
        return;
      }
      if (credits !== null && credits < 1) {
        setShowCreditWarning(true);
        handleVoiceStop();
        return;
      }

      // Start deducting credits every minute
      const interval = setInterval(async () => {
        try {
          const response = await axios.post('/api/credits/deduct-minute', {
            sessionId: currentSessionId
          }, {
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
            }
          });

          if (response.data.success) {
            const newCredits = response.data.remainingCredits;
            setCredits(newCredits);

            // Dispatch credit update event for layout
            window.dispatchEvent(new CustomEvent('creditUpdate', {
              detail: { credits: newCredits }
            }));

            // Show warning if credits are low
            if (newCredits <= 5 && newCredits > 0) {
              setShowCreditWarning(true);
              setTimeout(() => setShowCreditWarning(false), 5000);
            }

            // Stop session if no credits left
            if (newCredits <= 0) {
              setError('Session ended: No credits remaining');
              handleVoiceStop();
            }
          } else {
            setError('Session ended: ' + response.data.error);
            handleVoiceStop();
          }
        } catch (error: any) {
          console.error('Failed to deduct credits:', error);
          if (error.response?.status === 402) {
            setError('Session ended: Insufficient credits');
            handleVoiceStop();
          }
        }
      }, 60000); // Every minute

      setCreditDeductionInterval(interval);
    }

    // Cleanup interval when voice stops or disconnects
    if ((!voiceActive || connectionStatus !== 'connected') && creditDeductionInterval) {
      clearInterval(creditDeductionInterval);
      setCreditDeductionInterval(null);
    }
  }, [connectionStatus, voiceActive, currentSessionId, credits, creditsLoading, creditDeductionInterval]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-700 relative overflow-hidden">
      {(!voiceActive || (voiceActive && connectionStatus !== 'connected')) && !showFeedbackForm && (
        <div className="absolute inset-0 z-30">
          <StartButtonOverlay
            onStart={() => {
              setVoiceActive(true);
            }}
            connectionStatus={connectionStatus}
            creditsLoading={creditsLoading}
            outOfCredits={credits !== null && credits <= 0}
            remainingCredits={credits ?? undefined}
          />
        </div>
      )}
      <div className="flex-1 flex flex-col ml-0 lg:min-w-0 overflow-y-auto" ref={vizRef}>
        {code && library ? (
          <Card className="flex-1 flex flex-col bg-background/95 border-0 shadow-none rounded-none">
            <CardHeader>
              <div className="absolute left-0 px-8 w-full z-10 flex items-center justify-end">
                {/* <div className="flex items-center gap-2">
                  <CardTitle>{getLibraryDisplayName()} Visualization</CardTitle>
                </div> */}
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
                  <div className="flex items-center gap-2">
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
                  <div className="flex items-center gap-2">
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
            {/* Audio Visualizer - visualizer only, no audio initialization */}
            <div className="w-full max-w-sm h-8 max-h-12 mb-3 mx-auto" id="mobile-visualizer-container">
              {/* Visualizer will be rendered here by the main VoiceControl */}
            </div>

            {/* Controls */}
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

      {/* Feedback Form - positioned relative to main content only */}
      {
        showFeedbackForm && feedbackTrigger && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10 p-4 lg:left-20">
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
      {/* Credit Warning */}
      {
        showCreditWarning && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
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
}

export default function InteractiveAITutor(props: InteractiveAITutorProps) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InteractiveAITutorComponent {...props} />
    </Suspense>
  );
}