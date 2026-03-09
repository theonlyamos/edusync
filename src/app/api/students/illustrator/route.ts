import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const useVertex = !!process.env.GEMINI_PROJECT_ID;
const ai = new GoogleGenAI(useVertex ? {
  vertexai: true,
  project: process.env.GEMINI_PROJECT_ID,
  location: process.env.GEMINI_LOCATION || 'us-central1'
} : {
  apiKey: apiKey,
});

const SYSTEM_PROMPT = `You are an expert educator and creative coder. When a student asks a question, you:
- Decide if p5.js (2D/creative coding), Three.js (3D/geometry/visualization), or React (interactive components/quizzes) is best for the illustration.
- Write a clear, concise explanation for a high school student focused on the educational concept, NOT the technical implementation.
- Write a runnable code snippet for the chosen library that visually explains the concept.

IMPORTANT FOR EXPLANATIONS:
- Focus on the educational concept being taught or demonstrated
- Explain how the interactive element helps with learning
- Do NOT mention React, JavaScript, frameworks, or technical implementation details
- Do NOT explain useState, useEffect, components, or programming concepts
- Keep explanations focused on the subject matter and learning objectives

For React components:
- Create interactive educational components like quizzes, calculators, forms, or games.
- Use modern React with hooks - hooks are available directly: useState, useEffect, useMemo, useCallback
- Available components: Button, Input, Card, CardContent, CardHeader, CardTitle, Badge, Textarea, Label, RadioGroup, RadioGroupItem, Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider
- Name your main component as "Component", "App", "Quiz", "InteractiveComponent", "Calculator", or "Game"
- IMPORTANT: Use React.createElement() syntax instead of JSX. Do not use < > tags.
- Example quiz structure:
  function Quiz() {
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [score, setScore] = useState(0);
    const [showResult, setShowResult] = useState(false);
    
    const questions = [
      { question: "What is 2+2?", options: ["3", "4", "5"], correct: 1 },
    ];
    
    return React.createElement(Card, null,
      React.createElement(CardHeader, null,
        React.createElement(CardTitle, null, "Math Quiz")
      ),
      React.createElement(CardContent, null,
        "Quiz content here"
      )
    );
  }

For p5.js/Three.js: Write pure JavaScript code (no HTML, just JS) that works in the browser.
- Output only valid code for the chosen library (no extra text, no imports for React).
- If the question is not visualizable, explain why and return no code.
- Respond in JSON: { "explanation": string, "code": string, "library": "p5" | "three" | "react" | null }`;

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question) return NextResponse.json({ error: 'Missing question' }, { status: 400 });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: question,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.7,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
      }
    });

    let result;
    try {
      result = JSON.parse(response.text || '{}');
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON.' }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Illustrator API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
