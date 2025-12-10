import { z } from 'zod';

// Common validation schemas for API endpoints

// Feedback validation
export const feedbackSchema = z.object({
    rating: z.enum(['positive', 'neutral', 'negative']),
    experience: z.string().min(1, 'Experience is required').max(5000),
    improvements: z.string().max(5000).optional(),
    wouldRecommend: z.enum(['yes', 'no', 'maybe']),
    trigger: z.enum(['manual_stop', 'connection_reset', 'error']),
    timestamp: z.string(),
    userAgent: z.string(),
    sessionDurationSeconds: z.number().min(0).optional(),
    connectionCount: z.number().min(0).optional(),
    errorMessage: z.string().max(1000).optional(),
    sessionId: z.string().uuid().optional(),
});

// Assessment validation
export const assessmentSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    subject: z.string().min(1).max(100),
    gradelevel: z.string().min(1).max(50),
    type: z.string().min(1).max(50),
    duration: z.number().min(1).max(480), // Max 8 hours
    totalpoints: z.number().min(1).max(1000),
    passingscore: z.number().min(0).max(1000),
    questions: z.array(z.object({
        id: z.string(),
        type: z.enum(['multiple-choice', 'true-false', 'short-answer', 'essay']),
        question: z.string().min(1).max(5000),
        options: z.array(z.string()).optional(),
        correctAnswer: z.union([z.string(), z.number(), z.boolean()]).optional(),
        points: z.number().min(0).max(100),
    })),
});

// Lesson validation
export const lessonSchema = z.object({
    title: z.string().min(1).max(200),
    subject: z.string().min(1).max(100),
    gradelevel: z.string().max(50).optional(),
    objectives: z.array(z.string().max(500)).optional(),
    content: z.string().max(50000).optional(),
});

// Content generation validation
export const contentGenerationSchema = z.object({
    topic: z.string().min(1).max(500),
    subject: z.string().min(1).max(100),
    grade: z.string().min(1).max(50),
    type: z.enum(['quiz', 'worksheet', 'explanation', 'summary']),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

// Practice submission validation
export const practiceSubmissionSchema = z.object({
    subject: z.string().min(1).max(100),
    topic: z.string().min(1).max(200),
    answers: z.array(z.union([z.string(), z.number(), z.boolean()])),
    timeSpent: z.number().min(0).optional(),
});

// Chat message validation
export const chatMessageSchema = z.object({
    message: z.string().min(1).max(10000),
    lessonId: z.string().uuid().optional(),
    context: z.object({
        subject: z.string().optional(),
        topic: z.string().optional(),
    }).optional(),
});

// Resource validation
export const resourceSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    type: z.enum(['document', 'video', 'link', 'image']),
    url: z.string().url().optional(),
    fileId: z.string().uuid().optional(),
    subject: z.string().min(1).max(100),
    grade: z.string().min(1).max(50),
    tags: z.array(z.string().max(50)).optional(),
});

// UUID validation helper
export const uuidSchema = z.string().uuid('Invalid ID format');

// Pagination validation
export const paginationSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
});
