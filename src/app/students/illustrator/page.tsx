// AI-Powered Illustrative Explainer Page
'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VoiceControl } from '@/components/voice/VoiceControl';
import dynamic from 'next/dynamic';
import { Mic } from 'lucide-react';

const Editor = dynamic(() => import('@/components/lessons/CodeEditor').then(mod => mod.CodeEditor), { ssr: false });
const ReactRenderer = dynamic(() => import('@/components/lessons/ReactRenderer').then(mod => mod.ReactRenderer), { ssr: false });
const LiveSketch = dynamic(() => import('@/components/lessons/LiveSketch').then(mod => mod.LiveSketch), { ssr: false });

export default function IllustratorPage() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [code, setCode] = useState('');
  const [library, setLibrary] = useState<'p5' | 'three' | 'react' | null>(null);
  const [error, setError] = useState('');
  const [show, setShow] = useState<'render' | 'code'>('render');
  const [voiceActive, setVoiceActive] = useState(false);

  const handleAsk = async () => {
    setIsLoading(true);
    setError('');
    setExplanation('');
    setCode('');
    setLibrary(null);
    
    try {
      const res = await fetch('/api/students/illustrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: input })
      });
      
      if (!res.ok) throw new Error('Failed to get AI response');
      
      const data = await res.json();
      setExplanation(data.explanation);
      setCode(data.code);
      setLibrary(data.library);
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
    console.log('Received tool call from Gemini:', name, args);
    // Future: update UI or dispatch actions
  };

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-4rem)] gap-6 p-6">
        {/* Left Panel - Chat Window */}
        <div className="w-1/3 min-w-[350px] flex flex-col">
          <Card className="flex-1 flex flex-col">
            <CardHeader>
              <CardTitle>AI Illustrative Explainer</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="flex-1 flex flex-col gap-4">
                <Textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask the AI to explain or illustrate a concept, create a quiz, or build an interactive component..."
                  className="min-h-[100px]"
                  disabled={isLoading}
                />
                
                <div className="flex gap-2">
                  <Button onClick={handleAsk} disabled={isLoading || !input.trim()}>
                    {isLoading ? 'Generating...' : 'Ask AI'}
                  </Button>
                  {/* Mic toggle button */}
                  <Button
                    type="button"
                    variant={voiceActive ? 'secondary' : 'outline'}
                    size="icon"
                    onClick={() => setVoiceActive((prev) => !prev)}
                    title={voiceActive ? 'Stop voice streaming' : 'Start voice streaming'}
                  >
                    <Mic className={`w-5 h-5 ${voiceActive ? 'text-red-500 animate-pulse' : 'text-green-600'}`} />
                  </Button>
                </div>

                <div className="flex gap-2">
                  <VoiceControl active={voiceActive} onError={setError} onToolCall={handleToolCall} />
                </div>
                
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <div className="text-red-700 text-sm">{error}</div>
                  </div>
                )}
                
                {explanation && (
                  <div className="flex-1 overflow-y-auto">
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                      <h4 className="font-semibold text-blue-900 mb-2">Explanation</h4>
                      <p className="text-blue-800 text-sm leading-relaxed">{explanation}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Preview/Code Editor */}
        <div className="flex-1 flex flex-col">
          {code && library ? (
            <Card className="flex-1 flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{getLibraryDisplayName()} Visualization</CardTitle>
                  <ToggleGroup 
                    type="single" 
                    value={show} 
                    onValueChange={(v: string | undefined) => v && setShow(v as 'render' | 'code')}
                  >
                    <ToggleGroupItem value="render">Rendering</ToggleGroupItem>
                    <ToggleGroupItem value="code">Code</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col p-0">
                <div className="flex-1 p-6">
                  {show === 'render' && renderVisualization()}
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
            <Card className="flex-1 flex items-center justify-center">
              <CardContent>
                <div className="text-center text-muted-foreground">
                  <div className="text-lg mb-2">No visualization yet</div>
                  <div className="text-sm">Ask a question to generate a visualization, quiz, or interactive component</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
