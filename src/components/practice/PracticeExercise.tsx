'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

interface Question {
  id: string;
  question: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  options: string[];
  correctAnswer: string;
  explanation: string;
  points: number;
}

interface PracticeExerciseProps {
  subject: string;
  topic: string;
  questions: Question[];
  onComplete: (score: number) => void;
}

export function PracticeExercise({
  subject,
  topic,
  questions,
  onComplete,
}: PracticeExerciseProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>(
    new Array(questions.length).fill('')
  );
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  if (!currentQuestion) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="text-center">
            <p className="text-lg font-medium text-muted-foreground">
              No questions available. Please try again.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleAnswerSelect = (value: string) => {
    const newAnswers = [...selectedAnswers];
    newAnswers[currentQuestionIndex] = value;
    setSelectedAnswers(newAnswers);
  };

  const handleNext = () => {
    if (!selectedAnswers[currentQuestionIndex]) {
      toast({
        title: 'Select an Answer',
        description: 'Please select an answer before continuing.',
        variant: 'destructive',
      });
      return;
    }
    setCurrentQuestionIndex((prev) => prev + 1);
  };

  const handleSubmit = async () => {
    if (!selectedAnswers[currentQuestionIndex]) {
      toast({
        title: 'Select an Answer',
        description: 'Please select an answer before submitting.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/students/practice/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject,
          topic,
          questions,
          answers: questions.map((q, index) => ({
            questionId: q.id,
            answer: selectedAnswers[index],
          })),
        }),
      });

      if (!response.ok) throw new Error('Failed to submit answers');

      const data = await response.json();
      onComplete(data.score.percentage);
    } catch (error) {
      console.error('Error submitting answers:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit answers. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>
            Question {currentQuestionIndex + 1} of {questions.length}
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            {subject} - {topic}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-lg font-medium">{currentQuestion.question}</div>

        <RadioGroup
          value={selectedAnswers[currentQuestionIndex]}
          onValueChange={handleAnswerSelect}
          className="space-y-3"
        >
          {currentQuestion.options?.map((option: string, index: number) => (
            <div key={index} className="flex items-center space-x-2">
              <RadioGroupItem value={option} id={`option-${index}`} />
              <Label htmlFor={`option-${index}`}>{option}</Label>
            </div>
          ))}
        </RadioGroup>

        <div className="flex justify-end gap-4 pt-4">
          {!isLastQuestion ? (
            <Button onClick={handleNext} disabled={!selectedAnswers[currentQuestionIndex]}>
              Next Question
            </Button>
          ) : (
            <Button 
              onClick={handleSubmit} 
              disabled={!selectedAnswers[currentQuestionIndex] || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Answers'
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 