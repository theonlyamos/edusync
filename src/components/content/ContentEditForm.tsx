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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

interface ContentEditFormProps {
  contentId: string;
  contentType: string;
  initialContent: any;
  onSave: (updatedContent: any) => void;
  onClose: () => void;
}

export function ContentEditForm({
  contentId,
  contentType,
  initialContent,
  onSave,
  onClose,
}: ContentEditFormProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [content, setContent] = useState(initialContent);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(`/api/content/${contentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: content,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update content');
      }

      const updatedContent = await response.json();
      onSave(updatedContent);
      
      toast({
        title: 'Content Updated',
        description: 'The content has been successfully updated.',
      });
      
      onClose();
    } catch (error) {
      console.error('Error updating content:', error);
      toast({
        title: 'Error',
        description: 'Failed to update content. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderEditFields = () => {
    switch (contentType) {
      case 'quiz':
        return (
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={content.title}
                onChange={(e) =>
                  setContent({ ...content, title: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={content.description}
                onChange={(e) =>
                  setContent({ ...content, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-4">
              <Label>Questions</Label>
              {content.questions.map((question: any, index: number) => (
                <Card key={question.id}>
                  <CardContent className="pt-4 space-y-4">
                    <div>
                      <Label>Question {index + 1}</Label>
                      <Textarea
                        value={question.question}
                        onChange={(e) => {
                          const newQuestions = [...content.questions];
                          newQuestions[index] = {
                            ...question,
                            question: e.target.value,
                          };
                          setContent({ ...content, questions: newQuestions });
                        }}
                      />
                    </div>
                    {question.type === 'multiple_choice' && (
                      <div className="space-y-2">
                        <Label>Options</Label>
                        {question.options.map((option: string, optIndex: number) => (
                          <Input
                            key={optIndex}
                            value={option}
                            onChange={(e) => {
                              const newQuestions = [...content.questions];
                              const newOptions = [...question.options];
                              newOptions[optIndex] = e.target.value;
                              newQuestions[index] = {
                                ...question,
                                options: newOptions,
                              };
                              setContent({ ...content, questions: newQuestions });
                            }}
                          />
                        ))}
                      </div>
                    )}
                    <div>
                      <Label>Explanation</Label>
                      <Textarea
                        value={question.explanation}
                        onChange={(e) => {
                          const newQuestions = [...content.questions];
                          newQuestions[index] = {
                            ...question,
                            explanation: e.target.value,
                          };
                          setContent({ ...content, questions: newQuestions });
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );

      // Add cases for other content types
      default:
        return (
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={content.title}
                onChange={(e) =>
                  setContent({ ...content, title: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea
                value={JSON.stringify(content, null, 2)}
                onChange={(e) => {
                  try {
                    const newContent = JSON.parse(e.target.value);
                    setContent(newContent);
                  } catch (error) {
                    // Invalid JSON, ignore
                  }
                }}
                className="font-mono"
                rows={20}
              />
            </div>
          </div>
        );
    }
  };

  return (
    <Card className="w-[800px]">
      <CardHeader>
        <CardTitle>Edit Content</CardTitle>
        <CardDescription>
          Edit {contentType} content
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {renderEditFields()}
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
} 