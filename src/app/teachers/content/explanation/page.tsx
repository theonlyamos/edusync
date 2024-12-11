'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ExplanationContentType } from '@/components/content/types';
import { useToast } from '@/components/ui/use-toast';

interface ExplanationWithId extends ExplanationContentType {
  _id: string;
  lessonId: string;
}

export default function ExplanationPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [explanations, setExplanations] = useState<ExplanationWithId[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchExplanations();
  }, []);

  const fetchExplanations = async () => {
    try {
      const response = await fetch('/api/content?type=explanation');
      if (!response.ok) throw new Error('Failed to fetch explanations');
      const data = await response.json();
      setExplanations(data.map((item: any) => ({
        ...item.content,
        _id: item._id,
        lessonId: item.lessonId
      })));
    } catch (error) {
      console.error('Error fetching explanations:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch explanations',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateExplanation = async () => {
    setIsCreating(true);
    try {
      const response = await fetch('/api/content/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contentType: 'explanation',
          title: 'New Explanation',
          subject: 'Mathematics',
          gradeLevel: '9',
          topic: 'Quadratic Equations'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate explanation');
      }

      const explanation = await response.json();
      setExplanations(prev => [...prev, explanation]);
      toast({
        title: 'Success',
        description: 'Explanation created successfully',
      });
    } catch (error) {
      console.error('Error creating explanation:', error);
      toast({
        title: 'Error',
        description: 'Failed to create explanation',
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
            <h1 className="text-2xl font-bold">Explanations</h1>
          </div>
          <p>Loading explanations...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Explanations</h1>
          <Button onClick={handleCreateExplanation} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create New Explanation'}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {explanations.map((explanation) => (
            <Card 
              key={explanation._id}
              className="cursor-pointer hover:shadow-lg transition-all duration-200"
              onClick={() => router.push(`/teachers/lessons/${explanation.lessonId}/content/${explanation._id}`)}
            >
              <CardHeader>
                <CardTitle>{explanation.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {explanation.description}
                </p>
                <p className="text-sm">
                  {explanation.sections.length} sections
                  {explanation.prerequisites && ` • ${explanation.prerequisites.length} prerequisites`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
} 