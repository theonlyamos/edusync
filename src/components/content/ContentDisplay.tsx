'use client';

import { QuizContent, WorksheetContent, ExplanationContent, SummaryContent } from './types';
import type { 
  QuizContentType,
  WorksheetContentType,
  ExplanationContentType,
  SummaryContentType
} from './types';

interface ContentDisplayProps {
  type: 'quiz' | 'worksheet' | 'explanation' | 'summary';
  content: QuizContentType | WorksheetContentType | ExplanationContentType | SummaryContentType;
  showAnswers?: boolean;
}

export function ContentDisplay({ type, content, showAnswers = false }: ContentDisplayProps) {
  switch (type) {
    case 'quiz':
      return <QuizContent content={content as QuizContentType} showAnswers={showAnswers} />;
    case 'worksheet':
      return <WorksheetContent content={content as WorksheetContentType} showSolutions={showAnswers} />;
    case 'explanation':
      return <ExplanationContent content={content as ExplanationContentType} />;
    case 'summary':
      return <SummaryContent content={content as SummaryContentType} />;
    default:
      return (
        <div className="p-4 border rounded-lg bg-muted">
          <p>Unsupported content type: {type}</p>
        </div>
      );
  }
} 