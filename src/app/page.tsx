// AI-Powered Illustrative Explainer Page
'use client';

import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VoiceControl } from '@/components/voice/VoiceControl';
import { StartButtonOverlay } from '@/components/voice/StartButtonOverlay';
import { FeedbackForm, FeedbackData } from '@/components/feedback/FeedbackForm';
import dynamic from 'next/dynamic';
import { Loader2, Mic, Send, StopCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import axios from 'axios';

const Editor = dynamic(() => import('@/components/lessons/CodeEditor').then(mod => mod.CodeEditor), { ssr: false });
const ReactRenderer = dynamic(() => import('@/components/lessons/ReactRenderer').then(mod => mod.ReactRenderer), { ssr: false });
const LiveSketch = dynamic(() => import('@/components/lessons/LiveSketch').then(mod => mod.LiveSketch), { ssr: false });

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function HomeComponent() {
  const searchParams = useSearchParams();
  const debugMode = searchParams.get('debug') === 'true';

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [code, setCode] = useState('');
  const [library, setLibrary] = useState<'p5' | 'three' | 'react' | null>(null);
  type Visualization = { code: string; library: 'p5' | 'three' | 'react'; explanation?: string; taskDescription?: string; panelDimensions?: { width: number; height: number } };
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
  const vizRef = useRef<HTMLDivElement | null>(null);
  const isCapturingRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const showOverlay = !voiceActive || (voiceActive && connectionStatus !== 'connected');

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
  };

  const handleVoiceStop = async () => {
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
  };

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

  const renderVisualization = () => {
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
  };

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
            panel_dimensions: panelDimensions
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
        if (t) {
          setTopic(t);
          if (currentSessionId) {
            try { await axios.patch(`/api/learning/sessions/${currentSessionId}`, { topic: t }); } catch {}
          }
        }
      } catch {}
    }
  };

  const handleRendererError = async (errMsg: string) => {
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
        body: JSON.stringify({ task_description: taskDescription, panel_dimensions: panelDimensions })
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
    }, 1000);
    return () => clearInterval(id);
  }, [connectionStatus, show, code, library]);

  useEffect(() => {
    if (connectionStatus === 'connected' && voiceActive && currentSessionId) {
      (async () => {
        try {
          const res = await axios.post('/api/learning/sessions', { session_id: null, session_handle: null, topic });
          setCurrentSessionId(res.data.id as string);
        } catch {}
      })();
    }
  }, [connectionStatus, voiceActive, currentSessionId, topic]);

  useEffect(() => {
    if (connectionStatus === 'disconnected' && currentSessionId) {
      (async () => {
        try { await axios.patch(`/api/learning/sessions/${currentSessionId}`, { status: 'disconnected', ended: true }); } catch {}
        setCurrentSessionId(null);
      })();
    }
  }, [connectionStatus, currentSessionId]);

  return (
    <div className="flex h-screen bg-background">
      <div className="flex-1 relative">
        <div className="h-full">
          <div className="flex h-full relative">
            {showOverlay && (
              <div className="fixed inset-0 z-50">
                <StartButtonOverlay onStart={() => setVoiceActive(true)} connectionStatus={connectionStatus} />
              </div>
            )}
            {/* Left Panel - Chat Window - Fixed */}
            <div className="hidden lg:flex lg:w-1/3 lg:min-w-[350px] flex-col fixed left-0 top-0 h-full z-10 bg-background p-6">
              <Card className="flex-1 flex flex-col h-full">
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
                    <VoiceControl
                      active={voiceActive}
                      onError={setError}
                      onToolCall={handleToolCall}
                      onConnectionStatusChange={setConnectionStatus}
                      onCountdownEnd={handleCountdownEnd}
                      onCountdownChange={setCountdown}
                      onFeedbackFormChange={handleFeedbackFormChange}
                      onFeedbackSubmit={handleFeedbackSubmit}
                      onFeedbackClose={handleFeedbackClose}
                    />
                    {error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                        <div className="text-red-700 text-sm">{error}</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Panel - Preview/Code Editor */}
            <div className="flex-1 flex flex-col ml-0 lg:ml-[33.333333%] lg:min-w-0 p-6 overflow-y-auto"  ref={vizRef}>
              {code && library ? (
                <Card className="flex-1 flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{getLibraryDisplayName()} Visualization</CardTitle>
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
                          <div className="flex items-center gap-2">
                            <Button size="icon" variant="outline" onClick={goPrev} disabled={!canPrev} title="Previous visualization">
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="outline" onClick={goNext} disabled={!canNext} title="Next visualization">
                              <ChevronRight className="w-4 h-4" />
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
                          {renderVisualization()}
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
                  <Card className="flex-1 flex flex-col">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Visualization</CardTitle>
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
                <Card className="flex-1 flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Visualization</CardTitle>
                      
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
      
      {/* Feedback Form */}
      {showFeedbackForm && feedbackTrigger && (
        <FeedbackForm
          isOpen={showFeedbackForm}
          onClose={handleFeedbackClose}
          onSubmit={handleFeedbackSubmit}
          trigger={feedbackTrigger}
        />
      )}
      
      {voiceActive && connectionStatus === 'connected' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t lg:hidden">
          <div className="flex flex-col items-center py-3 px-4">
            {/* Audio Visualizer - visualizer only, no audio initialization */}
            <div className="w-full h-8 max-h-12 mb-3" id="mobile-visualizer-container">
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
