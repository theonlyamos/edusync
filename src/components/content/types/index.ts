export { QuizContent } from './QuizContent';
export { WorksheetContent } from './WorksheetContent';
export { ExplanationContent } from './ExplanationContent';
export { SummaryContent } from './SummaryContent';

export interface QuizContentType {
    title: string;
    description: string;
    questions: {
        id: string;
        type: 'multiple_choice' | 'true_false' | 'short_answer';
        question: string;
        options?: string[];
        correctAnswer: string | number | boolean;
        explanation: string;
    }[];
}

export interface WorksheetContentType {
    title: string;
    description: string;
    problems: {
        id: string;
        type: 'calculation' | 'word_problem' | 'fill_in_blank' | 'diagram';
        question: string;
        hints?: string[];
        solution: string;
        explanation: string;
        imageUrl?: string;
    }[];
    timeEstimate?: string;
    instructions?: string;
}

export interface ExplanationContentType {
    title: string;
    description: string;
    sections: {
        id: string;
        title: string;
        content: string;
        examples?: {
            problem: string;
            solution: string;
            explanation: string;
        }[];
        keyPoints?: string[];
        imageUrl?: string;
    }[];
    prerequisites?: string[];
    summary?: string;
}

export interface SummaryContentType {
    title: string;
    description: string;
    mainPoints: string[];
    conclusion: string;
} 