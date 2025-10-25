'use client';

import { useEffect, useRef, useState, Suspense, useCallback, useMemo, useContext } from 'react';
import { toPng } from 'html-to-image';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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

type Message = {
  role: 'user' | 'assistant';
  content: string;
};


function HomeComponent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const debugMode = searchParams.get('debug') === 'true';
  
  const sessionIdFromUrl = params?.id as string;

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [code, setCode] = useState('');
  const [library, setLibrary] = useState<'p5' | 'three' | 'react' | null>(null);
  type Visualization = { id?: string; code: string; library: 'p5' | 'three' | 'react'; explanation?: string; taskDescription?: string; panelDimensions?: { width: number; height: number } };
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
  const [topic, setTopic] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [creditDeductionInterval, setCreditDeductionInterval] = useState<NodeJS.Timeout | null>(null);
  const [showChatPanel, setShowChatPanel] = useState(true);
  const [sessionManuallyStopped, setSessionManuallyStopped] = useState(false);
  const vizRef = useRef<HTMLDivElement | null>(null);
  const isCapturingRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [replay, setReplay] = useState<{ conversationUrl?: string | null; userUrl: string | null; aiUrl: string | null; userParts?: string[]; aiParts?: string[]; durationMs: number } | null>(null);
  const [mode, setMode] = useState<'replay' | 'record'>('record');
  const [recordingsChecked, setRecordingsChecked] = useState(false);
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

  const showOverlay = (mode === 'record') && (!voiceActive || (voiceActive && connectionStatus !== 'connected')) && !showFeedbackForm;

  const handleCountdownEnd = async () => {
    if (currentSessionId) {
      try { await axios.patch(`/api/learning/sessions/${currentSessionId}`, { status: 'ended', ended: true }); } catch {}
      setCurrentSessionId(null);
    }
    setVoiceActive(false);
    setMessages([]);
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
      try { await axios.patch(`/api/learning/sessions/${currentSessionId}`, { status: 'ended', ended: true }); } catch {}
      setCurrentSessionId(null);
    }
    setVoiceActive(false);
    setMessages([]);
    setCode('');
    setLibrary(null);
    setVisualizations([]);
    setCurrentVizIndex(-1);
    setError('');
    setShowCreditWarning(false);
    setSessionManuallyStopped(true);
  };

  // Function to reset session state
  const resetSessionState = useCallback(() => {
    // Stop any active voice session
    if (voiceActive) {
      handleVoiceStop();
    }
    
    // Reset all session-related state
    setMessages([]);
    setCode('');
    setLibrary(null);
    setVisualizations([]);
    setCurrentVizIndex(-1);
    setError('');
    setInput('');
    setTopic(null);
    setCurrentSessionId(null);
    setShowFeedbackForm(false);
    setFeedbackTrigger(null);
    setGeneratingVisualization(false);
    setShowCreditWarning(false);
    setSessionManuallyStopped(false);
    
    // Clear any intervals
    if (creditDeductionInterval) {
      clearInterval(creditDeductionInterval);
      setCreditDeductionInterval(null);
    }
  }, [voiceActive, handleVoiceStop, creditDeductionInterval]);

  const handleFeedbackFormChange = (show: boolean, trigger: 'manual_stop' | 'connection_reset' | 'error' | null) => {
    setShowFeedbackForm(show);
    setFeedbackTrigger(trigger);
  };

  const handleFeedbackSubmit = async (feedback: FeedbackData) => {
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...feedback,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
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

  const handleRecordingsReady = useCallback(async ({ durationMs }: { user: Blob | null; ai: Blob | null; durationMs: number }) => {
    try {
      const sid = currentSessionId || sessionIdFromUrl;
      if (!sid) return;
      const { data } = await axios.get(`/api/learning/sessions/${sid}/recordings`);
      setReplay({ conversationUrl: data.conversationUrl, userUrl: data.userUrl, aiUrl: data.aiUrl, userParts: data.userParts, aiParts: data.aiParts, durationMs: data.durationMs ?? durationMs });
    } catch {}
  }, [currentSessionId, sessionIdFromUrl]);

  const handleStartSession = async () => {
    setConnectionStatus('connecting');
    try {
      // Create a new session
      const response = await axios.post('/api/learning/sessions', {
        session_id: null,
        session_handle: null,
        topic: null
      });
      
      const sessionId = response.data.id;
      
      // Navigate to the dynamic session page
      router.push(`/session/${sessionId}`);
    } catch (error: any) {
      console.error('Failed to create session:', error);
      setError(error.response?.data?.error || 'Failed to create session');
    }
  };

  const handleAsk = async () => {
    if (!input.trim()) return;
    const newUserMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, newUserMessage]);
    try {
      window.dispatchEvent(new CustomEvent('voice-send-text', { detail: input }));
      setInput('');
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const getLibraryDisplayName = () => {
    switch (library) {
      case 'p5': return 'p5.js';
      case 'three': return 'Three.js';
      case 'react': return 'React';
      default: return 'Visualization';
    }
  };

  const handleRendererError = useCallback(async (errMsg: string) => {
    try {
      setError(errMsg);
      if (currentVizIndex < 0 || currentVizIndex >= visualizations.length) return;
      setGeneratingVisualization(true);
      const panelElement = vizRef.current;
      let panelDimensions = { width: 800, height: 600 };
      if (panelElement) {
        const rect = panelElement.getBoundingClientRect();
        panelDimensions = { width: Math.floor(rect.width), height: Math.floor(rect.height) };
      }
      const taskDescription = visualizations[currentVizIndex]?.taskDescription;
      if (!taskDescription) return;
      const response = await fetch('/api/genai/visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_description: taskDescription, panel_dimensions: panelDimensions, theme, theme_colors: themeColors })
      });
      if (!response.ok) throw new Error('Failed to regenerate visualization');
      const vizData = await response.json();
      setVisualizations(prev => {
        const next = [...prev];
        next[currentVizIndex] = { code: vizData.code, library: vizData.library, explanation: vizData.explanation, taskDescription, panelDimensions };
        return next;
      });
      setCode(vizData.code);
      setLibrary(vizData.library);
      if (vizData.explanation) {
        setMessages(prev => [...prev, { role: 'assistant', content: vizData.explanation }]);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to regenerate visualization');
    } finally {
      setGeneratingVisualization(false);
    }
  }, [currentVizIndex, visualizations]);

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
        if (vizData.explanation) {
          const newAssistantMessage: Message = { role: 'assistant', content: vizData.explanation };
          setMessages(prev => [...prev, newAssistantMessage]);
        }
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
          } catch {}
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
            try { await axios.patch(`/api/learning/sessions/${currentSessionId}`, { topic: t }); } catch {}
          }
        }
      } catch {}
    }
  };

  const canPrev = currentVizIndex > 0;
  const canNext = currentVizIndex >= 0 && currentVizIndex < visualizations.length - 1;
  const goPrev = () => {
    if (!canPrev) return;
    const idx = currentVizIndex - 1;
    setCurrentVizIndex(idx);
    const v = visualizations[idx];
    setCode(v.code);
    setLibrary(v.library);
  };
  const goNext = () => {
    if (!canNext) return;
    const idx = currentVizIndex + 1;
    setCurrentVizIndex(idx);
    const v = visualizations[idx];
    setCode(v.code);
    setLibrary(v.library);
  };

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

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
        .catch(() => {})
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
          const res = await axios.post('/api/learning/sessions', { session_id: null, session_handle: null, topic });
          setCurrentSessionId(res.data.id as string);
        } catch {}
      })();
    }
  }, [connectionStatus, voiceActive, currentSessionId, topic]);

  useEffect(() => {
    const sid = sessionIdFromUrl || currentSessionId;
    if (!sid) return;
    if (connectionStatus === 'connected') return;
    (async () => {
      try {
        const { data } = await axios.get(`/api/learning/sessions/${sid}/recordings`);
        if (data?.conversationUrl || data?.userUrl || data?.aiUrl || (data?.userParts?.length || data?.aiParts?.length)) {
          setReplay({ conversationUrl: data.conversationUrl, userUrl: data.userUrl, aiUrl: data.aiUrl, userParts: data.userParts, aiParts: data.aiParts, durationMs: data.durationMs });
          setMode('replay');
        } else {
          setMode('record');
        }
      } catch {
        setMode('record');
      } finally {
        setRecordingsChecked(true);
      }
    })();
  }, [sessionIdFromUrl, currentSessionId, connectionStatus]);

  useEffect(() => {
    if (mode !== 'replay') return;
    const sid = sessionIdFromUrl || currentSessionId;
    if (!sid) return;
    (async () => {
      try {
        const { data } = await axios.get(`/api/learning/visualizations`, { params: { session_id: sid } });
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
        const msgs: Message[] = [];
        items.forEach((row: any) => {
          if (row.explanation) msgs.push({ role: 'assistant', content: row.explanation });
        });
        if (msgs.length > 0) setMessages(msgs);
      } catch {}
    })();
  }, [mode, sessionIdFromUrl, currentSessionId]);

  useEffect(() => {
    if (connectionStatus === 'disconnected' && currentSessionId) {
      (async () => {
        try { await axios.patch(`/api/learning/sessions/${currentSessionId}`, { status: 'disconnected', ended: true }); } catch {}
        setCurrentSessionId(null);
      })();
    }
  }, [connectionStatus, currentSessionId]);

  // Fetch initial credits
  useEffect(() => {
    const fetchCredits = async () => {
      try {
        setCreditsLoading(true);
        const response = await axios.get('/api/credits/status');
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

  // Auto-start only if no recordings exist (record mode). If recordings exist, default to replay and do not start.
  useEffect(() => {
    if (!recordingsChecked) return;
    if (mode === 'record' && sessionIdFromUrl && !currentSessionId && !voiceActive && !sessionManuallyStopped) {
      setCurrentSessionId(sessionIdFromUrl);
      setVoiceActive(true);
    }
  }, [mode, recordingsChecked, sessionIdFromUrl, currentSessionId, voiceActive, sessionManuallyStopped]);

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
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-purple-400/20 to-pink-600/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-cyan-400/10 to-blue-600/10 rounded-full blur-3xl"></div>
      </div>
      <div className="flex-1 relative">
        <div className="h-full">
          <div className={`flex h-full relative divide-x divide-border ${showChatPanel ? '' : 'chat-hidden'}`}> 
            {showOverlay && (
              <div className="absolute inset-0 z-30">
                <StartButtonOverlay 
                  onStart={() => {
                    setMode('record');
                    setVoiceActive(true);
                  }} 
                  connectionStatus={connectionStatus} 
                  creditsLoading={creditsLoading}
                  outOfCredits={credits !== null && credits <= 0}
                  remainingCredits={credits ?? undefined}
                />
              </div>
            )}
            {/* Left Panel - Chat Window */}
            <div className="chat-panel hidden lg:flex lg:w-1/3 lg:min-w-[350px] flex-col transition-[width,opacity] duration-300">
              <Card className="flex-1 flex flex-col h-full bg-background/95 border-0 shadow-none rounded-none">
                <CardHeader>
                  <CardTitle>AI Illustrative Explainer</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col overflow-hidden">
                  <div ref={messagesContainerRef} className="flex-1 overflow-y-auto mb-4 p-4 border rounded-md space-y-4">
                    {messages.map((msg, index) => (
                      <div key={index} className={`flex my-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`px-4 py-2 rounded-lg max-w-[80%] ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto flex flex-col gap-3">
                    <div className="border rounded-2xl p-2 bg-background">
                      <div className="flex items-end gap-2">
                        <Textarea
                          value={input}
                          onChange={e => setInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAsk();
                            }
                          }}
                          placeholder="Ask the AI to explain or illustrate a concept..."
                          className="flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 min-h-[48px] max-h-40"
                          disabled={isLoading || connectionStatus !== 'connected'}
                        />
                        <div className="flex items-center gap-1 pb-1 pr-1">
                          <Button onClick={handleAsk} disabled={isLoading || !input.trim() || connectionStatus !== 'connected'} size="icon" variant="ghost">
                            <Send className="w-5 h-5" />
                          </Button>
                                                     {voiceActive && (
                             <Button
                               type="button"
                               variant="ghost"
                               size="icon"
                               onClick={handleVoiceStop}
                               title="Stop voice streaming"
                             >
                               <StopCircle className="w-5 h-5 text-red-500" />
                             </Button>
                           )}
                        </div>
                      </div>
                    </div>
                    {mode === 'record' && (
                      <VoiceControl
                        active={voiceActive}
                        sessionId={currentSessionId || sessionIdFromUrl}
                        onError={setError}
                        onToolCall={handleToolCall}
                        onConnectionStatusChange={setConnectionStatus}
                        onCountdownEnd={handleCountdownEnd}
                        onCountdownChange={setCountdown}
                        onFeedbackFormChange={handleFeedbackFormChange}
                        onFeedbackSubmit={handleFeedbackSubmit}
                        onFeedbackClose={handleFeedbackClose}
                        onRecordingsReady={handleRecordingsReady}
                      />
                    )}
                    {error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                        <div className="text-red-700 text-sm">{error}</div>
                      </div>
                    )}
                    {mode === 'replay' && replay && (replay.conversationUrl || replay.userUrl || replay.aiUrl) && (
                      <div className="p-3 border rounded-md">
                        <div className="text-sm font-medium mb-2">Session Replay</div>
                        <div className="grid grid-cols-1 gap-3">
                          {replay.conversationUrl && (
                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground">Conversation (interleaved)</div>
                              <audio controls className="w-full" src={replay.conversationUrl} />
                            </div>
                          )}
                          {replay.userUrl && (
                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground">User</div>
                              <audio controls className="w-full" src={replay.userUrl} />
                            </div>
                          )}
                          {replay.aiUrl && (
                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground">AI</div>
                              <audio controls className="w-full" src={replay.aiUrl} />
                            </div>
                          )}
                          <div>
                            <Button
                              type="button"
                              onClick={() => {
                                setMode('record');
                                setVoiceActive(true);
                                setError('');
                              }}
                            >
                              Record new attempt
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Panel - Preview/Code Editor */}
            <div className="flex-1 flex flex-col ml-0 lg:min-w-0 overflow-y-auto"  ref={vizRef}>
              {code && library ? (
                <Card className="flex-1 flex flex-col bg-background/95 border-0 shadow-none rounded-none">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* Chat Panel Toggle - Only show on large screens */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowChatPanel((v) => !v);
                          }}
                          title={showChatPanel ? "Hide chat panel" : "Show chat panel"}
                          className="hidden lg:flex group hover:bg-transparent"
                        >
                          {showChatPanel ? (
                            <PanelLeftClose className="w-4 h-4 transition-transform text-muted-foreground group-hover:text-primary" />
                          ) : (
                            <MessageSquare className="w-4 h-4 transition-transform text-muted-foreground group-hover:text-primary" />
                          )}
                        </Button>
                        <CardTitle>{getLibraryDisplayName()} Visualization</CardTitle>
                      </div>
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
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Regenerate visualization"
                          onClick={async () => {
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
                              if (vizData.explanation) {
                                setMessages(prev => [...prev, { role: 'assistant', content: vizData.explanation }]);
                              }

                              if (current.id) {
                                try {
                                  await axios.put(`/api/learning/visualizations/${current.id}`, {
                                    code: vizData.code,
                                    library: vizData.library,
                                    explanation: vizData.explanation ?? null,
                                    panel_dimensions: panelDimensions
                                  });
                                } catch {}
                              }
                            } catch (e: any) {
                              setError(e.message || 'Failed to regenerate visualization');
                            } finally {
                              setGeneratingVisualization(false);
                            }
                          }}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        {visualizations.length > 0 && (
                          <div className="flex items-center gap-2">
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
                        <div className="h-full">
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
                            onSubmit={() => {}}
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
                          {/* Chat Panel Toggle - Only show on large screens */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowChatPanel((v) => !v);
                            }}
                            title={showChatPanel ? "Hide chat panel" : "Show chat panel"}
                            className="hidden lg:flex group hover:bg-transparent"
                          >
                            {showChatPanel ? (
                              <PanelLeftClose className="w-4 h-4 transition-transform text-muted-foreground group-hover:text-primary" />
                            ) : (
                              <MessageSquare className="w-4 h-4 transition-transform text-muted-foreground group-hover:text-primary" />
                            )}
                          </Button>
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
                        {/* Chat Panel Toggle - Only show on large screens */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowChatPanel((v) => !v);
                          }}
                          title={showChatPanel ? "Hide chat panel" : "Show chat panel"}
                          className="hidden lg:flex group hover:bg-transparent"
                        >
                          {showChatPanel ? (
                            <PanelLeftClose className="w-4 h-4 transition-transform text-muted-foreground group-hover:text-primary" />
                          ) : (
                            <MessageSquare className="w-4 h-4 transition-transform text-muted-foreground group-hover:text-primary" />
                          )}
                        </Button>
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
          </div>
        </div>
      </div>
      
      {/* Credit Warning */}
      {showCreditWarning && (
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
                onClick={() => window.open('/session/credits', '_blank')}
                className="ml-auto"
              >
                Buy Credits
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Form - positioned relative to main content only */}
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
      
      {voiceActive && connectionStatus === 'connected' && (
        <div className={`fixed bottom-0 left-0 right-0 z-50 ${showChatPanel ? 'lg:hidden' : ''}`}>
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
    </div>
  );
}

export default function Home() {
  return (
      <Suspense fallback={<div>Loading...</div>}>
        <HomeComponent />
      </Suspense>
  );
}
