'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Wand2, X } from "lucide-react";

type ContentType = 'quiz' | 'worksheet' | 'summary' | 'explanation';

interface Lesson {
  _id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  objectives: string;
  content: string;
}

interface CreateContentFormProps {
  onClose: () => void;
  lesson: Lesson;
}

export function CreateContentForm({ onClose, lesson }: CreateContentFormProps) {
  const [loading, setLoading] = useState(false);
  const [contentType, setContentType] = useState<ContentType>('quiz');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');

  const generateContent = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/content/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: contentType,
          lessonId: lesson._id,
          subject: lesson.subject,
          topic: lesson.title.split(' - ')[0],
          gradeLevel: lesson.gradeLevel,
          additionalInstructions,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate content');
      }

      const data = await response.json();
      setGeneratedContent(data.content);
    } catch (error) {
      console.error('Error generating content:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Generate Content</CardTitle>
            <CardDescription>
              Create supplementary content for: {lesson.title}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <div className="flex flex-col flex-1 overflow-hidden">
        <CardContent className="space-y-4 flex-1 overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="contentType">Content Type</Label>
            <select
              id="contentType"
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="quiz">Quiz Questions</option>
              <option value="worksheet">Worksheet</option>
              <option value="summary">Topic Summary</option>
              <option value="explanation">Detailed Explanation</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={lesson.subject}
              disabled
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              value={lesson.title.split(' - ')[0]}
              disabled
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gradeLevel">Grade Level</Label>
            <Input
              id="gradeLevel"
              value={lesson.gradeLevel}
              disabled
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="additionalInstructions">Additional Instructions (Optional)</Label>
            <textarea
              id="additionalInstructions"
              placeholder="Any specific requirements or focus areas"
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {generatedContent && (
            <div className="space-y-2">
              <Label>Generated Content</Label>
              <div className="rounded-md border bg-muted p-4">
                <pre className="text-sm whitespace-pre-wrap">
                  {generatedContent}
                </pre>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={generateContent}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Generate Content
          </Button>
          {generatedContent && (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                navigator.clipboard.writeText(generatedContent);
              }}
            >
              Copy to Clipboard
            </Button>
          )}
        </CardFooter>
      </div>
    </Card>
  );
} 