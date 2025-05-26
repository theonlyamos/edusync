import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are an expert educator and creative coder. When a student asks a question, you:
- Decide if p5.js (2D/creative coding) or Three.js (3D/geometry/visualization) is best for the illustration.
- Write a clear, concise explanation for a high school student.
- Write a runnable code snippet (no HTML, just JS) for the chosen library that visually explains the concept.
- Output only valid code for the chosen library (no extra text).
- If the question is not visualizable, explain why and return no code.
- Respond in JSON: { "explanation": string, "code": string, "library": "p5" | "three" | null }`;

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question) return NextResponse.json({ error: 'Missing question' }, { status: 400 });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL as string,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question }
      ],
      temperature: 0.7,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    let result;
    try {
      result = JSON.parse(completion.choices[0].message.content || '{}');
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON.' }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Illustrator API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
