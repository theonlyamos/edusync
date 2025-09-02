'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Check, X } from 'lucide-react';

interface Question {
  id: string;
  question: string;
  type: 'multiple_choice' | 'multiple_select' | 'true_false' | 'short_answer';
  options?: string[];
  correctAnswer: string | string[];
  explanation: string;
  points: number;
}

interface QuestionResult {
  question: Question;
  selectedAnswer: string | string[];
  isCorrect: boolean;
  earnedPoints: number;
}

interface PracticeExerciseProps {
  subject: string;
  topic: string;
  questions: Question[];
  onRetry?: () => void;
  onGenerateNew?: () => void;
  onComplete?: (score: number) => void;
}

export function PracticeExercise({
  subject,
  topic,
  questions,
  onRetry = () => {},
  onGenerateNew = () => {},
  onComplete,
}: PracticeExerciseProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<(string | string[])[]>(() => 
    questions.map(q => (q.type === 'multiple_select' ? [] : ''))
  );
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [results, setResults] = useState<{
    correctCount: number;
    totalPoints: number;
    earnedPoints: number;
    percentage: number;
    questionResults: QuestionResult[];
  } | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  if (!currentQuestion && !completed) {
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

  const handleSingleAnswerSelect = (value: string) => {
    const newAnswers = [...selectedAnswers];
    newAnswers[currentQuestionIndex] = value;
    setSelectedAnswers(newAnswers);
  };

  const handleMultipleAnswerSelect = (value: string, checked: boolean) => {
    const currentAnswer = selectedAnswers[currentQuestionIndex] as string[];
    let newAnswer: string[];
    
    if (checked) {
      newAnswer = [...currentAnswer, value];
    } else {
      newAnswer = currentAnswer.filter(answer => answer !== value);
    }
    
    const newAnswers = [...selectedAnswers];
    newAnswers[currentQuestionIndex] = newAnswer;
    setSelectedAnswers(newAnswers);
  };

  const isAnswerSelected = () => {
    const currentAnswer = selectedAnswers[currentQuestionIndex];
    
    if (currentQuestion?.type === 'multiple_select') {
      return (currentAnswer as string[]).length > 0;
    } else {
      return Boolean(currentAnswer);
    }
  };

  const handleNext = () => {
    if (!isAnswerSelected()) {
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
    if (!isAnswerSelected()) {
      toast({
        title: 'Select an Answer',
        description: 'Please select an answer before submitting.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      let correctCount = 0;
      const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
      let earnedPoints = 0;
      const questionResults: QuestionResult[] = [];
      
      questions.forEach((question, index) => {
        const selectedAnswer = selectedAnswers[index];
        const correctAnswer = question.correctAnswer;
        
        let isCorrect = false;
        
        switch(question.type) {
          case 'multiple_choice':
          case 'true_false':
            isCorrect = selectedAnswer === correctAnswer;
            break;
            
          case 'multiple_select':
            if (Array.isArray(selectedAnswer) && Array.isArray(correctAnswer)) {
              isCorrect = 
                selectedAnswer.length === correctAnswer.length && 
                selectedAnswer.every(ans => correctAnswer.includes(ans));
            }
            break;
            
          case 'short_answer':
            if (typeof selectedAnswer === 'string' && typeof correctAnswer === 'string') {
              isCorrect = selectedAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
            }
            break;
        }
        
        const pointsEarned = isCorrect ? question.points : 0;
        
        questionResults.push({
          question,
          selectedAnswer,
          isCorrect,
          earnedPoints: pointsEarned
        });
        
        if (isCorrect) {
          correctCount++;
          earnedPoints += question.points;
        }
      });
      
      const percentage = Math.round((earnedPoints / totalPoints) * 100);
      
      setResults({
        correctCount,
        totalPoints,
        earnedPoints,
        percentage,
        questionResults
      });
      
      setCompleted(true);
      onComplete?.(percentage);
    } catch (error) {
      console.error('Error calculating score:', error);
      toast({
        title: 'Error',
        description: 'Failed to calculate your score. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isOptionChecked = (option: string) => {
    const currentAnswer = selectedAnswers[currentQuestionIndex];
    if (Array.isArray(currentAnswer)) {
      return currentAnswer.includes(option);
    }
    return false;
  };

  const renderQuestionContent = () => {
    switch(currentQuestion.type) {
      case 'multiple_choice':
        return (
          <RadioGroup
            value={selectedAnswers[currentQuestionIndex] as string}
            onValueChange={handleSingleAnswerSelect}
            className="space-y-3"
          >
            {currentQuestion.options?.map((option, index) => (
              <div key={index} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`option-${index}`} />
                <Label htmlFor={`option-${index}`}>{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );
        
      case 'multiple_select':
        return (
          <div className="space-y-3">
            {currentQuestion.options?.map((option, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Checkbox 
                  id={`option-${index}`} 
                  checked={isOptionChecked(option)}
                  onCheckedChange={(checked) => handleMultipleAnswerSelect(option, !!checked)}
                />
                <Label htmlFor={`option-${index}`}>{option}</Label>
              </div>
            ))}
          </div>
        );
        
      case 'true_false':
        return (
          <RadioGroup
            value={selectedAnswers[currentQuestionIndex] as string}
            onValueChange={handleSingleAnswerSelect}
            className="space-y-3"
          >
            {["True", "False"].map((option, index) => (
              <div key={index} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`option-${index}`} />
                <Label htmlFor={`option-${index}`}>{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );
        
      case 'short_answer':
        return (
          <div className="space-y-2">
            <Label htmlFor="short-answer">Your Answer</Label>
            <Textarea
              id="short-answer"
              value={selectedAnswers[currentQuestionIndex] as string}
              onChange={(e) => handleSingleAnswerSelect(e.target.value)}
              placeholder="Type your answer here..."
              className="w-full min-h-[120px]"
            />
          </div>
        );
        
      default:
        return <p>Unsupported question type</p>;
    }
  };

  // Render results view (with incorrect questions toggle)
  const renderResults = () => {
    if (results === null) return null;

    const incorrectQuestions = results.questionResults.filter(r => !r.isCorrect);

    // Toggle function
    const toggleRevealAnswer = (questionId: string) => {
      setRevealedAnswers(prev => {
        const newSet = new Set(prev);
        if (newSet.has(questionId)) {
          newSet.delete(questionId);
        } else {
          newSet.add(questionId);
        }
        return newSet;
      });
    };

    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Practice Completed</CardTitle>
          <CardDescription className="text-center">
            {subject} - {topic}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Score Summary */}
          <div className="p-6 bg-muted rounded-lg text-center">
            <h3 className="text-4xl font-bold mb-2">{results.percentage}%</h3>
            <p className="text-muted-foreground">
              You answered {results.correctCount} out of {questions.length} questions correctly.
            </p>
            <p className="text-muted-foreground">
              ({results.earnedPoints} / {results.totalPoints} points)
            </p>
          </div>

          {/* Incorrect Questions Breakdown */}
          {incorrectQuestions.length > 0 && (
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-xl font-semibold text-center">Review Questions Missed</h3>
              {incorrectQuestions.map((result, index) => {
                const isRevealed = revealedAnswers.has(result.question.id);
                return (
                  <Card key={`incorrect-${index}`} className="border-red-200">
                    <CardContent className="pt-4 space-y-3">
                      <p className="font-medium">{result.question.question}</p>
                      
                      <div>
                        <h4 className="text-sm font-semibold text-muted-foreground mb-1">Your Answer:</h4>
                        <p className="ml-2 text-red-600">
                          {Array.isArray(result.selectedAnswer)
                            ? result.selectedAnswer.join(", ") || "(No answer selected)"
                            : result.selectedAnswer || "(No answer selected)"}
                        </p>
                      </div>
                      
                      {/* Correct Answer Section with Toggle */}
                      <div className="mb-1">
                        <Button 
                          variant="link" 
                          className="p-0 h-auto text-xs mb-1"
                          onClick={() => toggleRevealAnswer(result.question.id)}
                        >
                          {isRevealed ? "Hide Answer" : "Show Answer"}
                        </Button>
                        {isRevealed && (
                          <div>
                            <h4 className="text-sm font-semibold text-muted-foreground mb-1">Correct Answer:</h4>
                            <p className="ml-2 text-green-600">
                              {Array.isArray(result.question.correctAnswer)
                                ? result.question.correctAnswer.join(", ")
                                : result.question.correctAnswer}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {/* Explanation (optional) */}
                      {/* {isRevealed && (
                        <div className="mt-3 pt-3 border-t">
                          <h4 className="text-sm font-semibold text-muted-foreground mb-1">Explanation:</h4>
                          <p className="text-sm">{result.question.explanation}</p>
                        </div>
                      )} */}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-center gap-4">
          <Button onClick={onRetry} variant="outline">Retry Practice</Button>
          <Button onClick={onGenerateNew}>Generate New Practice</Button>
        </CardFooter>
      </Card>
    );
  };

  // Main render logic
  if (completed && results !== null) {
    return renderResults();
  }

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
        
        {renderQuestionContent()}

        <div className="flex justify-end gap-4 pt-4">
          {!isLastQuestion ? (
            <Button onClick={handleNext} disabled={!isAnswerSelected()}>
              Next Question
            </Button>
          ) : (
            <Button 
              onClick={handleSubmit} 
              disabled={!isAnswerSelected() || submitting}
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