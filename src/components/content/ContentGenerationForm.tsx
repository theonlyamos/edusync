'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

interface ContentGenerationFormProps {
  lessonId: string;
  lessonTitle: string;
  subject: string;
  gradeLevel: string;
  onContentGenerated: (content: any) => void;
  onClose: () => void;
  open: boolean;
}

export function ContentGenerationForm({
  lessonId,
  lessonTitle,
  subject,
  gradeLevel,
  onContentGenerated,
  onClose,
  open
}: ContentGenerationFormProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [contentType, setContentType] = useState<string>('');
  const [topic, setTopic] = useState('');
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);

    try {
      // First, generate the content
      const generateResponse = await fetch('/api/content/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lessonId,
          contentType: contentType as 'quiz' | 'worksheet' | 'explanation' | 'summary',
          title: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} - ${topic}`,
          subject,
          gradeLevel,
          topic
        }),
      });

      if (!generateResponse.ok) {
        const errorData = await generateResponse.text();
        throw new Error(errorData || 'Failed to generate content');
      }

      const generatedContent = await generateResponse.json();
      
      // Then, save the content
      const saveResponse = await fetch('/api/content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lessonId,
          type: contentType,
          content: generatedContent
        }),
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save content');
      }

      const savedContent = await saveResponse.json();
      onContentGenerated(savedContent);
      toast({
        title: 'Success',
        description: 'Content generated and saved successfully',
      });
      onClose();
    } catch (error) {
      console.error('Error generating content:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate content',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Content</DialogTitle>
          <DialogDescription>
            Create content for lesson: {lessonTitle}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contentType">Content Type</Label>
            <Select
              value={contentType}
              onValueChange={(value: 'quiz' | 'worksheet' | 'explanation' | 'summary') => setContentType(value)}
            >
              <SelectTrigger id="contentType">
                <SelectValue placeholder="Select content type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quiz">Quiz</SelectItem>
                <SelectItem value="worksheet">Worksheet</SelectItem>
                <SelectItem value="explanation">Explanation</SelectItem>
                <SelectItem value="summary">Summary</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              placeholder="Enter specific topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!contentType || !topic || isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
} 