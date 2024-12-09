'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SummaryContent } from '@/components/content/types';
import type { SummaryContentType } from '@/components/content/types';

export default function SummaryPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [summaries, setSummaries] = useState<SummaryContentType[]>([]);

  const handleCreateSummary = async () => {
    setIsCreating(true);
    try {
      const response = await fetch('/api/content/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contentType: 'summary',
          title: 'New Summary',
          subject: 'Mathematics',
          gradeLevel: '9',
          topic: 'Quadratic Equations'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const summary = await response.json();
      setSummaries(prev => [...prev, summary]);
    } catch (error) {
      console.error('Error creating summary:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Summaries</h1>
          <Button onClick={handleCreateSummary} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create New Summary'}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle>{summary.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {summary.description}
                </p>
                <p className="text-sm">
                  {summary.mainIdeas.length} main ideas • {summary.topics.length} topics
                </p>
                <div className="mt-4 space-x-2">
                  <Button variant="outline" size="sm">
                    Preview
                  </Button>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                  <Button variant="outline" size="sm">
                    Share
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {summaries.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Preview</h2>
            <SummaryContent 
              content={summaries[summaries.length - 1]} 
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
} 