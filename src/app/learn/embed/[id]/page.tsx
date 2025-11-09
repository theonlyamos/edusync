'use client';

import { useEffect, useRef, useState, Suspense, useCallback, useMemo, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { toPng } from 'html-to-image';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VoiceControl } from '@/components/voice/VoiceControl';
import { StartButtonOverlay } from '@/components/voice/StartButtonOverlay';
import { Loader2, Send, StopCircle, X, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';
import axios from 'axios';

const Editor = dynamic(() => import('@/components/lessons/CodeEditor').then(mod => mod.CodeEditor), { ssr: false });
const ReactRenderer = dynamic(() => import('@/components/lessons/ReactRenderer').then(mod => mod.ReactRenderer), { ssr: false });
const LiveSketch = dynamic(() => import('@/components/lessons/LiveSketch').then(mod => mod.LiveSketch), { ssr: false });

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type Visualization = { 
  id?: string; 
  code: string; 
  library: 'p5' | 'three' | 'react'; 
  explanation?: string; 
  taskDescription?: string; 
  panelDimensions?: { width: number; height: number } 
};

function EmbedComponent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const sessionIdFromUrl = resolvedParams.id;
  const searchParams = useSearchParams();
  const apiKey = searchParams.get('apiKey');
  const topicFromUrl = searchParams.get('topic');

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [code, setCode] = useState('');
  const [library, setLibrary] = useState<'p5' | 'three' | 'react' | null>(null);
  const [visualizations, setVisualizations] = useState<Visualization[]>([]);
  const [currentVizIndex, setCurrentVizIndex] = useState<number>(-1);
  const [error, setError] = useState('');
  const [show, setShow] = useState<'render' | 'code'>('render');
  const [voiceActive, setVoiceActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [countdown, setCountdown] = useState(600);
  const [generatingVisualization, setGeneratingVisualization] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [creditDeductionInterval, setCreditDeductionInterval] = useState<NodeJS.Timeout | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [themeColors, setThemeColors] = useState<any>(null);
  const vizRef = useRef<HTMLDivElement | null>(null);
  const isCapturingRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const showOverlay = !voiceActive || (voiceActive && connectionStatus !== 'connected');

  useEffect(() => {
    if (!apiKey) {
      setError('Missing API key. Please include ?apiKey=YOUR_API_KEY in the URL.');
    }
  }, [apiKey]);

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

  const handleVoiceStop = async () => {
    if (creditDeductionInterval) {
      clearInterval(creditDeductionInterval);
      setCreditDeductionInterval(null);
    }

    if (currentSessionId) {
      try {
        await axios.patch(`/api/learning/sessions/${currentSessionId}`, { 
          status: 'ended', 
          ended: true 
        }, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
        });
      } catch {}
      setCurrentSessionId(null);
    }
    setVoiceActive(false);
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
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
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
      } catch (e: any) {
        setError(e.message || 'Unknown error');
      } finally {
        setGeneratingVisualization(false);
      }
    }
  };

  useEffect(() => {
    if (topicFromUrl && !topic) {
      setTopic(topicFromUrl);
    }
  }, [topicFromUrl, topic]);

  useEffect(() => {
    if (connectionStatus === 'connected' && voiceActive && !currentSessionId && apiKey) {
      (async () => {
        try {
          const res = await axios.post('/api/embed/sessions', 
            { topic: topic || topicFromUrl || null },
            { headers: { Authorization: `Bearer ${apiKey}` } }
          );
          setCurrentSessionId(res.data.sessionId);
        } catch (err: any) {
          setError(err.response?.data?.error || 'Failed to create session');
        }
      })();
    }
  }, [connectionStatus, voiceActive, currentSessionId, topic, topicFromUrl, apiKey]);

  useEffect(() => {
    if (connectionStatus === 'connected' && voiceActive && currentSessionId && !creditDeductionInterval && apiKey) {
      const interval = setInterval(async () => {
        try {
          const response = await axios.post('/api/embed/credits/deduct-minute', {
            sessionId: currentSessionId
          }, {
            headers: { Authorization: `Bearer ${apiKey}` }
          });

          if (response.data.success) {
            const newCredits = response.data.remainingCredits;
            setCredits(newCredits);

            if (newCredits <= 5 && newCredits > 0) {
              setShowCreditWarning(true);
              setTimeout(() => setShowCreditWarning(false), 5000);
            }

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
      }, 60000);

      setCreditDeductionInterval(interval);
    }

    if ((!voiceActive || connectionStatus !== 'connected') && creditDeductionInterval) {
      clearInterval(creditDeductionInterval);
      setCreditDeductionInterval(null);
    }
  }, [connectionStatus, voiceActive, currentSessionId, creditDeductionInterval, apiKey]);

  const renderVisualization = useMemo(() => {
    if (!code || !library) return null;

    switch (library) {
      case 'react':
        return <ReactRenderer code={code} onError={(err) => setError(err)} />;
      case 'p5':
      case 'three':
        return <LiveSketch code={code} library={library} />;
      default:
        return null;
    }
  }, [code, library]);

  return (
    <div className="flex h-screen bg-background">
      <div className="flex-1 relative">
        <div className="h-full">
          <div className="flex h-full">
            {showOverlay && (
              <div className="absolute inset-0 z-30 bg-background/95 backdrop-blur-sm">
                {apiKey ? (
                  <StartButtonOverlay 
                    onStart={() => setVoiceActive(true)} 
                    connectionStatus={connectionStatus}
                    creditsLoading={false}
                    outOfCredits={false}
                    remainingCredits={credits ?? undefined}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Card className="max-w-md">
                      <CardHeader>
                        <CardTitle className="text-red-500">Missing API Key</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p>This embedded session requires an API key. Please add ?apiKey=YOUR_API_KEY to the URL.</p>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

            <div className="w-1/3 flex flex-col border-r">
              <Card className="flex-1 flex flex-col h-full">
                <CardHeader>
                  <CardTitle className="text-sm">AI Explainer</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div ref={messagesContainerRef} className="flex-1 overflow-y-auto mb-4 p-4 border rounded-md space-y-4">
                    {messages.map((msg, index) => (
                      <div key={index} className={`flex my-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`px-4 py-2 rounded-lg max-w-[80%] ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto flex gap-2">
                    <Textarea
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAsk();
                        }
                      }}
                      placeholder="Ask a question..."
                      className="flex-1"
                      disabled={isLoading || connectionStatus !== 'connected'}
                    />
                    <Button onClick={handleAsk} disabled={isLoading || !input.trim() || connectionStatus !== 'connected'}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  <VoiceControl
                    active={voiceActive}
                    sessionId={currentSessionId || sessionIdFromUrl}
                    topic={topic}
                    onError={setError}
                    onToolCall={handleToolCall}
                    onConnectionStatusChange={setConnectionStatus}
                    onCountdownEnd={() => {}}
                    onCountdownChange={setCountdown}
                    onFeedbackFormChange={() => {}}
                    onFeedbackSubmit={async () => {}}
                    onFeedbackClose={() => {}}
                    onRecordingsReady={async () => {}}
                  />
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md mt-2">
                      <div className="text-red-700 text-sm">{error}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex-1 flex flex-col" ref={vizRef}>
              {code && library ? (
                <Card className="flex-1 flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-sm">Visualization</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    {!generatingVisualization ? (
                      <div className="h-full">{renderVisualization}</div>
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <Loader2 className="w-10 h-10 animate-spin" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <div className="text-lg mb-2">No visualization yet</div>
                    <div className="text-sm">Start a voice session to generate visualizations</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCreditWarning && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  {credits !== null && credits <= 0 ? 'No credits remaining!' : `Only ${credits} credits left!`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EmbedComponent params={params} />
    </Suspense>
  );
}

