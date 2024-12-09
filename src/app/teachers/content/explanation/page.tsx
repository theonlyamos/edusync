'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExplanationContent } from '@/components/content/types';
import type { ExplanationContentType } from '@/components/content/types';

export default function ExplanationPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [explanations, setExplanations] = useState<ExplanationContentType[]>([]);

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
    } catch (error) {
      console.error('Error creating explanation:', error);
    } finally {
      setIsCreating(false);
    }
  };

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
          {explanations.map((explanation, index) => (
            <Card key={index}>
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

        {explanations.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Preview</h2>
            <ExplanationContent 
              content={explanations[explanations.length - 1]} 
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
} 