import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';

// Ensure the API key is set in environment variables
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error('GEMINI_API_KEY environment variable not set');
}

export async function POST(request: NextRequest) {
    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY || '' });

        const body = await request.json();
        const { message, canvasData }: { message: string; canvasData: string } = body;

        if (!message || !canvasData) {
            return NextResponse.json({ error: 'Missing message or canvasData' }, { status: 400 });
        }

        const base64Match = canvasData.match(/^data:image\/png;base64,(.+)$/);
        if (!base64Match || !base64Match[1]) {
            return NextResponse.json({ error: 'Invalid canvasData format. Expected data:image/png;base64,...' }, { status: 400 });
        }
        const base64Image = base64Match[1];

        const contents = [
            { text: message },
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: base64Image,
                },
            },
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp-image-generation',
            contents: contents,
            config: {
                responseModalities: [Modality.TEXT, Modality.IMAGE],
            },
        });

        let textReply: string | null = null;
        let imageData: string | null = null;

        if (!response.candidates || response.candidates.length === 0) {
            return NextResponse.json({ error: 'No response candidates received' }, { status: 500 });
        }

        const parts = response.candidates[0]?.content?.parts;
        if (!parts) {
            return NextResponse.json({ error: 'Response format invalid: missing content parts' }, { status: 500 });
        }

        for (const part of parts) {
            if (part.text) {
                textReply = part.text || null;
            } else if (part.inlineData && part.inlineData.data) {
                imageData = part.inlineData.data;
            }
        }

        if (!textReply && !imageData) {
            return NextResponse.json({ error: 'No text or image data in response' }, { status: 500 });
        }

        return NextResponse.json({
            reply: textReply,
            imageData: imageData
        });

    } catch (error) {
        console.error('API Route Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
    }
} 