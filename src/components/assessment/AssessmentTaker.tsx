'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Timer, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Question {
  _id: string;
  question: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  options?: string[];
  points: number;
}

interface Assessment {
  _id: string;
  title: string;
  description: string;
  duration: number;
  totalPoints: number;
  questions: Question[];
}

interface AssessmentTakerProps {
  assessment: Assessment;
}

export function AssessmentTaker({ assessment }: AssessmentTakerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(assessment.duration * 60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [startTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 300 && prev > 290) { // Show warning at 5 minutes
          setShowTimeWarning(true);
        }
        if (prev <= 0) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const currentQuestion = assessment.questions[currentQuestionIndex];

  const handleAnswerSelect = (value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion._id]: value,
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < assessment.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      // Format answers for submission
      const formattedAnswers = Object.entries(answers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));

      const response = await fetch(`/api/assessments/${assessment._id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answers: formattedAnswers,
          startedAt: startTime.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit assessment');
      }

      const data = await response.json();
      toast({
        title: 'Assessment Submitted',
        description: data.message,
      });

      router.push('/assessments/results');
    } catch (error) {
      console.error('Error submitting assessment:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit assessment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestion = () => {
    switch (currentQuestion.type) {
      case 'multiple_choice':
        return (
          <RadioGroup
            value={answers[currentQuestion._id] || ''}
            onValueChange={handleAnswerSelect}
            className="space-y-3"
          >
            {currentQuestion.options?.map((option, index) => (
              <div key={index} className="flex items-center gap-3">
                <RadioGroupItem value={option} id={`option-${index}`} className="shrink-0" />
                <Label htmlFor={`option-${index}`} className="min-h-11 xl:min-h-0 min-w-0 flex-1 cursor-pointer py-3 xl:py-0 break-words leading-relaxed">{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );

      case 'true_false':
        return (
          <RadioGroup
            value={answers[currentQuestion._id] || ''}
            onValueChange={handleAnswerSelect}
            className="space-y-3"
          >
            <div className="flex items-center gap-3">
              <RadioGroupItem value="true" id="true" className="shrink-0" />
              <Label htmlFor="true" className="min-h-11 xl:min-h-0 flex-1 cursor-pointer py-3 xl:py-0 leading-relaxed">True</Label>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="false" id="false" className="shrink-0" />
              <Label htmlFor="false" className="min-h-11 xl:min-h-0 flex-1 cursor-pointer py-3 xl:py-0 leading-relaxed">False</Label>
            </div>
          </RadioGroup>
        );

      case 'short_answer':
        return (
          <Input
            className="min-h-11 xl:min-h-0 text-base xl:text-sm"
            value={answers[currentQuestion._id] || ''}
            onChange={(e) => handleAnswerSelect(e.target.value)}
            placeholder="Enter your answer..."
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="container max-w-3xl mx-auto p-3 sm:p-6">
      <Card className="min-w-0 break-words">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
            <div className="min-w-0">
              <CardTitle>{assessment.title}</CardTitle>
              <CardDescription>{assessment.description}</CardDescription>
            </div>
            <div className="flex shrink-0 items-center space-x-2 text-muted-foreground">
              <Timer className="h-4 w-4" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-4 sm:px-6">
          <div className="flex flex-wrap gap-2 justify-between items-center text-sm text-muted-foreground">
            <span>
              Question {currentQuestionIndex + 1} of {assessment.questions.length}
            </span>
            <span>{currentQuestion.points} points</span>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium">{currentQuestion.question}</h3>
            {renderQuestion()}
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4 [&>button]:min-h-11 xl:[&>button]:min-h-0">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentQuestionIndex === 0}
            >
              Previous
            </Button>
            {currentQuestionIndex === assessment.questions.length - 1 ? (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Assessment'
                )}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!answers[currentQuestion._id]}
              >
                Next
              </Button>
            )}
          </div>
        </CardContent>
        <CardFooter className="px-4 sm:px-6">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{
                width: `${(Object.keys(answers).length / assessment.questions.length) * 100}%`,
              }}
            />
          </div>
        </CardFooter>
      </Card>

      <AlertDialog open={showTimeWarning} onOpenChange={setShowTimeWarning}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-h-[85dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Time Warning</AlertDialogTitle>
            <AlertDialogDescription>
              You have less than 5 minutes remaining. Please make sure to submit your assessment before time runs out.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="min-h-11 xl:min-h-0">Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
