/**
 * Content Generation Agent
 *
 * An ADK agent that dynamically generates educational content (quizzes,
 * worksheets, explanations, summaries) based on a teacher's request. Replaces
 * the hardcoded switch-case logic in `/api/content/generate`.
 */

import { LlmAgent } from '@google/adk';
import { getModel, createRunner } from './agent-config';
import { fetchExternalContent, googleSearch } from './tools/content-tools';
import { lookupLessonContent } from './tools/db-tools';

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

export const contentAgent = new LlmAgent({
    name: 'content_generator',
    model: getModel(),

    instruction: `You are an expert educational content creator. Given a subject, 
grade level, topic, and content type, you create high-quality educational material.

## Content Types
You can generate the following content types:
- **quiz**: Multiple choice, true/false, and short answer questions that test understanding.
- **worksheet**: Practice problems with hints and detailed solutions.
- **explanation**: Clear, structured explanations with examples and key points.
- **summary**: Concise summaries highlighting main concepts and connections.

## Output Format
ALWAYS respond with valid JSON matching the requested content type schema.

### Quiz Schema
{
  "title": string,
  "description": string,
  "questions": [{ "id": string, "type": "multiple_choice" | "true_false" | "short_answer", "question": string, "options"?: string[], "correctAnswer": string | number | boolean, "acceptableAnswers"?: string[], "explanation": string }]
}

### Worksheet Schema
{
  "title": string,
  "description": string,
  "instructions": string,
  "timeEstimate": string,
  "problems": [{ "id": string, "type": "calculation" | "word_problem" | "fill_in_blank" | "diagram", "question": string, "hints": string[], "solution": string, "explanation": string }]
}

### Explanation Schema
{
  "title": string,
  "description": string,
  "prerequisites": string[],
  "sections": [{ "id": string, "title": string, "content": string, "keyPoints": string[], "examples": [{ "problem": string, "solution": string, "explanation": string }] }],
  "summary": string
}

### Summary Schema
{
  "title": string,
  "description": string,
  "mainPoints": string[],
  "topics": [{ "id": string, "title": string, "content": string, "keyPoints": string[], "relatedConcepts": string[] }],
  "conclusion": string
}

## Tools
You have access to tools. Use them when helpful:
- **lookup_lesson_content**: Fetch existing lesson material from the database to base content on.
- **fetch_external_content**: Pull in external reference material from a URL.
- **google_search**: Search the web for up-to-date information on a topic.

## Guidelines
- Adapt complexity and language to the specified grade level.
- Generate unique IDs for each question/problem/section (use short alphanumeric strings).
- Ensure questions have clear, unambiguous correct answers.
- Include helpful explanations for all answers.`,

    tools: [lookupLessonContent, fetchExternalContent, googleSearch],

    generateContentConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json',
    },
});

// ---------------------------------------------------------------------------
// Helper to run the content agent
// ---------------------------------------------------------------------------

export interface ContentGenerationRequest {
    contentType: 'quiz' | 'worksheet' | 'explanation' | 'summary';
    topic: string;
    subject: string;
    gradeLevel: string;
    title?: string;
    lessonId?: string;
}

export async function generateContent(request: ContentGenerationRequest) {
    const runner = createRunner(contentAgent);

    const userMessage = request.lessonId
        ? `Generate a ${request.contentType} about "${request.topic}" for grade ${request.gradeLevel} ${request.subject} students. First look up the lesson with ID "${request.lessonId}" for context.`
        : `Generate a ${request.contentType} about "${request.topic}" for grade ${request.gradeLevel} ${request.subject} students.`;

    let finalText = '';

    for await (const event of runner.runEphemeral({
        userId: 'teacher',
        newMessage: { role: 'user', parts: [{ text: userMessage }] },
    })) {
        // Collect the final text response from the agent
        if (event.content?.parts) {
            for (const part of event.content.parts) {
                if (part.text) {
                    finalText = part.text;
                }
            }
        }
    }

    return JSON.parse(finalText);
}
