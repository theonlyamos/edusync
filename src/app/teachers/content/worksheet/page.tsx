'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WorksheetContent } from '@/components/content/types';
import type { WorksheetContentType } from '@/components/content/types';

export default function WorksheetPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [worksheets, setWorksheets] = useState<WorksheetContentType[]>([]);

  const handleCreateWorksheet = async () => {
    setIsCreating(true);
    try {
      const response = await fetch('/api/content/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contentType: 'worksheet',
          title: 'New Worksheet',
          subject: 'Mathematics',
          gradeLevel: '9',
          topic: 'Quadratic Equations'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate worksheet');
      }

      const worksheet = await response.json();
      setWorksheets(prev => [...prev, worksheet]);
    } catch (error) {
      console.error('Error creating worksheet:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Worksheets</h1>
          <Button onClick={handleCreateWorksheet} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create New Worksheet'}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {worksheets.map((worksheet, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle>{worksheet.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {worksheet.description}
                </p>
                <p className="text-sm">
                  {worksheet.problems.length} problems • {worksheet.timeEstimate}
                </p>
                <div className="mt-4 space-x-2">
                  <Button variant="outline" size="sm">
                    Preview
                  </Button>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                  <Button variant="outline" size="sm">
                    Assign
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {worksheets.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Preview</h2>
            <WorksheetContent 
              content={worksheets[worksheets.length - 1]} 
              showSolutions={true}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
} 