// AI-Powered Illustrative Explainer Page
'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import dynamic from 'next/dynamic';

const Editor = dynamic(() => import('@/components/lessons/CodeEditor').then(mod => mod.CodeEditor), { ssr: false });

export default function IllustratorPage() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [code, setCode] = useState('');
  const [library, setLibrary] = useState<'p5' | 'three' | null>(null);
  const [error, setError] = useState('');

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

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>AI Illustrative Explainer</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask the AI to explain or illustrate a concept..."
              className="mb-4"
              rows={2}
              disabled={isLoading}
            />
            <Button onClick={handleAsk} disabled={isLoading || !input.trim()}>
              {isLoading ? 'Generating...' : 'Ask AI'}
            </Button>
            {error && <div className="text-red-500 mt-2">{error}</div>}
            {explanation && (
              <div className="prose dark:prose-invert mt-6">
                <h3>Explanation</h3>
                <p>{explanation}</p>
              </div>
            )}
            {code && library && (
              <div className="mt-6">
                <h3 className="mb-2">{library === 'p5' ? 'p5.js' : 'Three.js'} Visualization</h3>
                <Editor
                  data={{
                    initialCode: code,
                    language: "javascript",
                    tests: [],
                  }}
                  onSubmit={() => {}}
                />
                <LiveSketch code={code} library={library} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

// Dynamically import the live sketch renderer
const LiveSketch = dynamic(() => import('@/components/lessons/LiveSketch').then(mod => mod.LiveSketch), { ssr: false });
