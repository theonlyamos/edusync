/**
 * Tutor Orchestrator Agent
 *
 * A top-level agent that coordinates content generation and visualisation
 * sub-agents to provide a rich tutoring experience. It can decide whether to
 * explain, generate content, create a visualisation, or quiz the student —
 * delegating to specialised sub-agents as needed.
 */

import { LlmAgent } from '@google/adk';
import { getModel, createRunner } from './agent-config';
import { contentAgent } from './content-agent';
import { visualizationAgent } from './visualization-agent';
import { lookupStudentProgress, lookupAssessmentResults } from './tools/db-tools';
import { googleSearch } from './tools/content-tools';

// ---------------------------------------------------------------------------
// Agent definition
// ---------------------------------------------------------------------------

export const tutorAgent = new LlmAgent({
    name: 'tutor_orchestrator',
    model: getModel(),

    instruction: `You are an AI tutor orchestrator for the EduSync educational platform. Your job is to help students learn by providing the most appropriate type of response to their questions.

## Capabilities
You can:
1. **Explain concepts** directly in clear, grade-appropriate language.
2. **Delegate to content_generator** to create structured educational content (quizzes, worksheets, explanations, summaries).
3. **Delegate to visualization_generator** to create interactive visual aids that make concepts tangible.
4. **Look up student data** to personalise your responses based on their history.

## Decision Framework
When a student asks a question, decide the best approach:
- Simple factual question → Answer directly.
- "Explain X" → Provide a clear explanation AND generate a visualization if the concept is visual.
- "Quiz me on X" → Delegate to content_generator with contentType=quiz.
- "Show me X" or visual concept → Delegate to visualization_generator.
- "Help me practice X" → Delegate to content_generator with contentType=worksheet.
- Complex concept → Explain + visualize + suggest practice.

## Response Format
Always respond with a JSON object:
{
  "text": "Your spoken/written explanation to the student",
  "visualization": { "code": "...", "library": "react|p5|three", "explanation": "..." } | null,
  "content": { ... structured content matching quiz/worksheet/explanation/summary schema } | null,
  "suggestedFollowUp": "A question the student might want to explore next" | null
}

## Guidelines
- Adapt your language complexity to the student's grade level.
- Be encouraging and supportive.
- Use analogies and real-world examples.
- When looking up student data, use it to personalize recommendations.
- NEVER expose internal tool names or technical details to the student.`,

    subAgents: [contentAgent, visualizationAgent],
    tools: [lookupStudentProgress, lookupAssessmentResults, googleSearch],

    generateContentConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json',
    },
});

// ---------------------------------------------------------------------------
// Helper to run the tutor agent
// ---------------------------------------------------------------------------

export interface TutorRequest {
    message: string;
    studentId?: string;
    lessonId?: string;
    subject?: string;
    gradeLevel?: string;
}

export interface TutorResponse {
    text: string;
    visualization?: {
        code: string;
        library: 'react' | 'p5' | 'three';
        explanation: string;
    } | null;
    content?: Record<string, unknown> | null;
    suggestedFollowUp?: string | null;
}

export async function runTutor(request: TutorRequest): Promise<TutorResponse> {
    const runner = createRunner(tutorAgent);

    let prompt = request.message;

    if (request.subject || request.gradeLevel) {
        prompt += `\n\n[Context: Subject: ${request.subject ?? 'General'}, Grade Level: ${request.gradeLevel ?? 'Not specified'}]`;
    }

    if (request.studentId) {
        prompt += `\n[Student ID for data lookup: ${request.studentId}]`;
    }

    if (request.lessonId) {
        prompt += `\n[Current Lesson ID: ${request.lessonId}]`;
    }

    let finalText = '';

    for await (const event of runner.runEphemeral({
        userId: request.studentId ?? 'anonymous',
        newMessage: { role: 'user', parts: [{ text: prompt }] },
    })) {
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
