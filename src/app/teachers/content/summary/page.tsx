'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SummaryContentType } from '@/components/content/types';
import { useToast } from '@/components/ui/use-toast';

interface SummaryWithId extends SummaryContentType {
  _id: string;
  lessonId: string;
}

export default function SummaryPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [summaries, setSummaries] = useState<SummaryWithId[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchSummaries();
  }, []);

  const fetchSummaries = async () => {
    try {
      const response = await fetch('/api/content?type=summary');
      if (!response.ok) throw new Error('Failed to fetch summaries');
      const data = await response.json();
      setSummaries(data.map((item: any) => ({
        ...item.content,
        _id: item._id,
        lessonId: item.lessonId
      })));
    } catch (error) {
      console.error('Error fetching summaries:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch summaries',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

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
      toast({
        title: 'Success',
        description: 'Summary created successfully',
      });
    } catch (error) {
      console.error('Error creating summary:', error);
      toast({
        title: 'Error',
        description: 'Failed to create summary',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Summaries</h1>
          </div>
          <p>Loading summaries...</p>
        </div>
      </DashboardLayout>
    );
  }

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
          {summaries.map((summary) => (
            <Card 
              key={summary._id}
              className="cursor-pointer hover:shadow-lg transition-all duration-200"
              onClick={() => router.push(`/teachers/lessons/${summary.lessonId}/content/${summary._id}`)}
            >
              <CardHeader>
                <CardTitle>{summary.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {summary.description}
                </p>
                <p className="text-sm">
                  {summary.mainPoints.length} main points
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
} 