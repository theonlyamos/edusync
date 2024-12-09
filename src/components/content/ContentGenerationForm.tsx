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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ContentGenerationFormProps {
  lessonId: string;
  lessonTitle: string;
  subject: string;
  gradeLevel: string;
  onContentGenerated: (content: any) => void;
  onClose: () => void;
}

export function ContentGenerationForm({
  lessonId,
  lessonTitle,
  subject,
  gradeLevel,
  onContentGenerated,
  onClose
}: ContentGenerationFormProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [contentType, setContentType] = useState<string>('');
  const [topic, setTopic] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);

    try {
      const response = await fetch('/api/content/generate', {
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

      if (!response.ok) {
        throw new Error('Failed to generate content');
      }

      const generatedContent = await response.json();
      
      // Structure the content for saving with proper typing
      const contentToSave = {
        lessonId,
        type: contentType as 'quiz' | 'worksheet' | 'explanation' | 'summary',
        content: generatedContent,
        title: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} - ${topic}`
      };

      onContentGenerated(contentToSave);
      onClose();
    } catch (error) {
      console.error('Error generating content:', error);
      setIsGenerating(false);
    }
  };

  return (
    <Card className="w-[500px]">
      <CardHeader>
        <CardTitle>Generate Content</CardTitle>
        <CardDescription>
          Create content for lesson: {lessonTitle}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
} 