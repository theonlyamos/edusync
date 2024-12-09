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

interface WorksheetProblem {
  id: string;
  type: 'calculation' | 'word_problem' | 'fill_in_blank' | 'diagram';
  question: string;
  hints?: string[];
  solution: string;
  explanation: string;
  imageUrl?: string;
}

interface WorksheetContent {
  title: string;
  description: string;
  problems: WorksheetProblem[];
  instructions?: string;
  timeEstimate?: string;
}

interface WorksheetContentProps {
  content: WorksheetContent;
  showSolutions?: boolean;
}

export function WorksheetContent({ content, showSolutions = false }: WorksheetContentProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showHints, setShowHints] = useState<Record<string, boolean>>({});
  const [showExplanations, setShowExplanations] = useState<Record<string, boolean>>({});

  const handleAnswerChange = (problemId: string, answer: string) => {
    setAnswers(prev => ({
      ...prev,
      [problemId]: answer
    }));
  };

  const toggleHint = (problemId: string) => {
    setShowHints(prev => ({
      ...prev,
      [problemId]: !prev[problemId]
    }));
  };

  const toggleExplanation = (problemId: string) => {
    setShowExplanations(prev => ({
      ...prev,
      [problemId]: !prev[problemId]
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{content.title}</CardTitle>
        <CardDescription>
          {content.description}
          {content.timeEstimate && (
            <span className="block mt-1">
              Estimated time: {content.timeEstimate}
            </span>
          )}
        </CardDescription>
        {content.instructions && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium">Instructions:</p>
            <p className="text-sm">{content.instructions}</p>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {content.problems.map((problem, index) => (
          <div key={problem.id} className="space-y-4 p-4 rounded-lg border">
            <div className="flex justify-between items-start">
              <span className="text-sm text-muted-foreground">Problem {index + 1}</span>
              <div className="space-x-2">
                {problem.hints && problem.hints.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleHint(problem.id)}
                  >
                    {showHints[problem.id] ? 'Hide Hint' : 'Show Hint'}
                  </Button>
                )}
                {showSolutions && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExplanation(problem.id)}
                  >
                    {showExplanations[problem.id] ? 'Hide Solution' : 'Show Solution'}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="font-medium">{problem.question}</p>
                {problem.imageUrl && (
                  <img
                    src={problem.imageUrl}
                    alt={`Diagram for problem ${index + 1}`}
                    className="mt-2 max-w-full h-auto rounded-lg"
                  />
                )}
              </div>

              {showHints[problem.id] && problem.hints && (
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium">Hints:</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {problem.hints.map((hint, hintIndex) => (
                      <li key={hintIndex}>{hint}</li>
                    ))}
                  </ul>
                </div>
              )}

              <textarea
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Enter your solution..."
                value={answers[problem.id] || ''}
                onChange={(e) => handleAnswerChange(problem.id, e.target.value)}
              />

              {showSolutions && showExplanations[problem.id] && (
                <div className="p-4 bg-muted rounded-md space-y-2">
                  <div>
                    <p className="text-sm font-medium">Solution:</p>
                    <p className="text-sm">{problem.solution}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Explanation:</p>
                    <p className="text-sm">{problem.explanation}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button className="w-full">
          {showSolutions ? 'Print Worksheet' : 'Submit Answers'}
        </Button>
      </CardFooter>
    </Card>
  );
} 