import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { generateAICompletion } from '@/lib/ai';
import { v4 as uuidv4 } from 'uuid';
import type {
    QuizContentType,
    WorksheetContentType,
    ExplanationContentType,
    SummaryContentType
} from '@/components/content/types';

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { title, subject, gradeLevel, contentType, topic } = await req.json();

        if (!contentType || !topic || !subject || !gradeLevel) {
            return new NextResponse('Missing required fields', { status: 400 });
        }

        let systemPrompt = "You are an experienced teacher and educational content creator. ";
        let userPrompt = "";

        switch (contentType) {
            case 'quiz':
                systemPrompt += "Create engaging quiz questions that test understanding and critical thinking. Format the response as a JSON object.";
                userPrompt = `Create a quiz about ${topic} for ${gradeLevel} grade ${subject} students.
The quiz should include a mix of multiple choice, true/false, and short answer questions.
Format the response as a JSON object with the following structure:
{
  "title": string,
  "description": string,
  "questions": Array<{
    "id": string,
    "type": "multiple_choice" | "true_false" | "short_answer",
    "question": string,
    "options"?: string[], // Required for multiple_choice
    "correctAnswer": string | number | boolean,
    "acceptableAnswers"?: string[], // Optional for short_answer
    "explanation": string
  }>
}`;
                break;

            case 'worksheet':
                systemPrompt += "Create practice problems that reinforce learning and build skills. Format the response as a JSON object.";
                userPrompt = `Create a worksheet about ${topic} for ${gradeLevel} grade ${subject} students.
Format the response as a JSON object with the following structure:
{
  "title": string,
  "description": string,
  "instructions": string,
  "timeEstimate": string,
  "problems": Array<{
    "id": string,
    "type": "calculation" | "word_problem" | "fill_in_blank" | "diagram",
    "question": string,
    "hints": string[],
    "solution": string,
    "explanation": string
  }>
}`;
                break;

            case 'explanation':
                systemPrompt += "Create clear, detailed explanations that break down complex topics. Format the response as a JSON object.";
                userPrompt = `Create an explanation about ${topic} for ${gradeLevel} grade ${subject} students.
Format the response as a JSON object with the following structure:
{
  "title": string,
  "description": string,
  "prerequisites": string[],
  "sections": Array<{
    "id": string,
    "title": string,
    "content": string,
    "keyPoints": string[],
    "examples": Array<{
      "problem": string,
      "solution": string,
      "explanation": string
    }>
  }>,
  "summary": string
}`;
                break;

            case 'summary':
                systemPrompt += "Create concise summaries that highlight key concepts and connections. Format the response as a JSON object.";
                userPrompt = `Create a summary about ${topic} for ${gradeLevel} grade ${subject} students.
Format the response as a JSON object with the following structure:
{
  "title": string,
  "description": string,
  "mainPoints": string[],
  "topics": Array<{
    "id": string,
    "title": string,
    "content": string,
    "keyPoints": string[],
    "relatedConcepts": string[]
  }>,
  "conclusion": string
}`;
                break;

            default:
                return new NextResponse('Invalid content type', { status: 400 });
        }

        try {
            const generatedContent = await generateAICompletion(
                systemPrompt,
                userPrompt,
                undefined,
                true
            );

            if (!generatedContent) {
                return new NextResponse('No content generated from AI', { status: 500 });
            }

            // Parse and validate the JSON structure
            let parsedContent;
            try {
                parsedContent = JSON.parse(generatedContent);

                // Add UUIDs to items that need them
                switch (contentType) {
                    case 'quiz':
                        parsedContent.questions = parsedContent.questions.map((q: any) => ({
                            ...q,
                            id: uuidv4()
                        }));
                        break;
                    case 'worksheet':
                        parsedContent.problems = parsedContent.problems.map((p: any) => ({
                            ...p,
                            id: uuidv4()
                        }));
                        break;
                    case 'explanation':
                        parsedContent.sections = parsedContent.sections.map((s: any) => ({
                            ...s,
                            id: uuidv4()
                        }));
                        break;
                    case 'summary':
                        if (parsedContent.topics) {
                            parsedContent.topics = parsedContent.topics.map((t: any) => ({
                                ...t,
                                id: uuidv4()
                            }));
                        }
                        break;
                }
            } catch (error) {
                console.error('Invalid JSON format received:', error, generatedContent);
                return new NextResponse('Invalid content format received from AI', { status: 500 });
            }

            return NextResponse.json(parsedContent);
        } catch (error: any) {
            console.error('OpenAI API error:', error);
            return new NextResponse(
                `AI generation error: ${error.message || 'Unknown error'}`,
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error('Error generating content:', error);
        return new NextResponse(
            `Server error: ${error.message || 'Unknown error'}`,
            { status: 500 }
        );
    }
} 