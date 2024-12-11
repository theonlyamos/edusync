'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorksheetContentType } from '@/components/content/types';
import { useToast } from '@/components/ui/use-toast';

interface WorksheetWithId extends WorksheetContentType {
  _id: string;
  lessonId: string;
}

export default function WorksheetPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [worksheets, setWorksheets] = useState<WorksheetWithId[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchWorksheets();
  }, []);

  const fetchWorksheets = async () => {
    try {
      const response = await fetch('/api/content?type=worksheet');
      if (!response.ok) throw new Error('Failed to fetch worksheets');
      const data = await response.json();
      setWorksheets(data.map((item: any) => ({
        ...item.content,
        _id: item._id,
        lessonId: item.lessonId
      })));
    } catch (error) {
      console.error('Error fetching worksheets:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch worksheets',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

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
      toast({
        title: 'Success',
        description: 'Worksheet created successfully',
      });
    } catch (error) {
      console.error('Error creating worksheet:', error);
      toast({
        title: 'Error',
        description: 'Failed to create worksheet',
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
            <h1 className="text-2xl font-bold">Worksheets</h1>
          </div>
          <p>Loading worksheets...</p>
        </div>
      </DashboardLayout>
    );
  }

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
          {worksheets.map((worksheet) => (
            <Card 
              key={worksheet._id}
              className="cursor-pointer hover:shadow-lg transition-all duration-200"
              onClick={() => router.push(`/teachers/lessons/${worksheet.lessonId}/content/${worksheet._id}`)}
            >
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
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
} 