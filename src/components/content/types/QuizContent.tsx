'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  question: string;
  options?: string[];
  correctAnswer: string | number | boolean;
  acceptableAnswers?: string[];
  explanation: string;
}

interface QuizContent {
  title: string;
  description: string;
  questions: QuizQuestion[];
}

interface QuizContentProps {
  content: QuizContent;
  showAnswers?: boolean;
}

export function QuizContent({ content, showAnswers = false }: QuizContentProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, any>>({});
  const [showExplanations, setShowExplanations] = useState<Record<string, boolean>>({});

  const handleAnswerSelect = (questionId: string, answer: any) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const toggleExplanation = (questionId: string) => {
    setShowExplanations(prev => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  const renderQuestion = (question: QuizQuestion) => {
    switch (question.type) {
      case 'multiple_choice':
        return (
          <div className="space-y-2">
            <p className="font-medium">{question.question}</p>
            <div className="space-y-1">
              {question.options?.map((option, index) => (
                <Button
                  key={index}
                  variant={selectedAnswers[question.id] === option ? "secondary" : "outline"}
                  className="w-full justify-start"
                  onClick={() => handleAnswerSelect(question.id, option)}
                  disabled={showAnswers}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>
        );

      case 'true_false':
        return (
          <div className="space-y-2">
            <p className="font-medium">{question.question}</p>
            <div className="flex gap-2">
              <Button
                variant={selectedAnswers[question.id] === true ? "secondary" : "outline"}
                onClick={() => handleAnswerSelect(question.id, true)}
                disabled={showAnswers}
              >
                True
              </Button>
              <Button
                variant={selectedAnswers[question.id] === false ? "secondary" : "outline"}
                onClick={() => handleAnswerSelect(question.id, false)}
                disabled={showAnswers}
              >
                False
              </Button>
            </div>
          </div>
        );

      case 'short_answer':
        return (
          <div className="space-y-2">
            <p className="font-medium">{question.question}</p>
            <textarea
              className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Enter your answer..."
              value={selectedAnswers[question.id] || ''}
              onChange={(e) => handleAnswerSelect(question.id, e.target.value)}
              disabled={showAnswers}
            />
          </div>
        );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{content.title}</CardTitle>
        <CardDescription>{content.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {content.questions.map((question, index) => (
          <div key={question.id} className="space-y-4 p-4 rounded-lg border">
            <div className="flex justify-between items-start">
              <span className="text-sm text-muted-foreground">Question {index + 1}</span>
              {showAnswers && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleExplanation(question.id)}
                >
                  Show Explanation
                </Button>
              )}
            </div>
            {renderQuestion(question)}
            {showAnswers && showExplanations[question.id] && (
              <div className="mt-2 p-4 rounded-md bg-muted">
                <p className="text-sm font-medium">Explanation:</p>
                <p className="text-sm">{question.explanation}</p>
                <p className="text-sm font-medium mt-2">Correct Answer:</p>
                <p className="text-sm">
                  {typeof question.correctAnswer === 'boolean'
                    ? question.correctAnswer ? 'True' : 'False'
                    : question.correctAnswer}
                </p>
              </div>
            )}
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          onClick={() => setShowExplanations({})}
          disabled={!showAnswers}
        >
          {showAnswers ? 'Show All Explanations' : 'Submit Quiz'}
        </Button>
      </CardFooter>
    </Card>
  );
} 