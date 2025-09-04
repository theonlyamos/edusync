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
import dynamic from 'next/dynamic';
import { Mic, Send, StopCircle, X } from 'lucide-react';

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
  const [error, setError] = useState('');
  const [show, setShow] = useState<'render' | 'code'>('render');
  const [voiceActive, setVoiceActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const vizRef = useRef<HTMLDivElement | null>(null);
  const isCapturingRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const showOverlay = !voiceActive || (voiceActive && connectionStatus !== 'connected');

  const handleCountdownEnd = () => {
    setVoiceActive(false);
    setMessages([]);
    setCode('');
    setLibrary(null);
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
        return <ReactRenderer code={code} />;
      case 'p5':
      case 'three':
        return <LiveSketch code={code} library={library} />;
      default:
        return null;
    }
  };

  const handleToolCall = (name: string, args: any) => {
    if (args.explanation) {
      const newAssistantMessage: Message = { role: 'assistant', content: args.explanation };
      setMessages(prev => [...prev, newAssistantMessage]);
    }
    setCode(args.code);
    setLibrary(args.library);
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

  return (
    <div className="flex h-screen bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 px-4">
          <div className="flex h-[calc(100vh-4rem)] gap-4 p-4 lg:gap-6 lg:p-6 relative pb-20 lg:pb-0">
            {showOverlay && <StartButtonOverlay onStart={() => setVoiceActive(true)} connectionStatus={connectionStatus} />}
            {/* Left Panel - Chat Window */}
            <div className="hidden lg:flex lg:w-1/3 lg:min-w-[350px] flex-col">
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
                    <VoiceControl
                      active={voiceActive}
                      onError={setError}
                      onToolCall={handleToolCall}
                      onConnectionStatusChange={setConnectionStatus}
                      onCountdownEnd={handleCountdownEnd}
                    />
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
                              onClick={() => setVoiceActive(false)}
                              title="Stop voice streaming"
                            >
                              <StopCircle className="w-5 h-5 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
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
            <div className="flex-1 flex flex-col"  ref={vizRef}>
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
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col p-0">
                    <div className="flex-1 p-6">
                      {show === 'render' && (
                        <div className="h-full">
                          {renderVisualization()}
                        </div>
                      )}
                      {show === 'code' && (
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
                      )}
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
              )}
            </div>
          </div>
        </div>
      </div>
      {voiceActive && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-transparent lg:hidden">
          <div className="flex items-center justify-center py-3">
            <div className="flex items-center gap-4">
              <span className={`w-3 h-3 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
              <Button
                type="button"
                size="icon"
                className="rounded-full bg-red-500 hover:bg-red-600 text-white w-12 h-12"
                onClick={() => setVoiceActive(false)}
                title="Disconnect"
              >
                <X className="w-6 h-6" />
              </Button>
              <Mic className="w-6 h-6 text-blue-500" />
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
