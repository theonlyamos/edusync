import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { createServerSupabase, createSSRUserSupabase } from '@/lib/supabase.server';
import { getUserSchoolId } from '@/lib/school';
import { enforceDailyCap } from '@/lib/daily-caps';

const MAX_MESSAGE_LENGTH = 2000;
// A drawn canvas as PNG is well under this; it stops oversized uploads reaching the model.
const MAX_CANVAS_LENGTH = 8 * 1024 * 1024;

// Ensure the API key is set in environment variables
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error('GEMINI_API_KEY environment variable not set');
}

export async function POST(request: NextRequest) {
    try {
        // Signed-in school members only.
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Please sign in to use the collaborator.' }, { status: 401 });
        }
        const schoolId = await getUserSchoolId(createServerSupabase(), user.id);
        if (!schoolId) {
            return NextResponse.json({ error: 'The collaborator is available to school members.' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const { message, canvasData }: { message: unknown; canvasData: unknown } = body;

        if (typeof message !== 'string' || !message.trim() || typeof canvasData !== 'string' || !canvasData) {
            return NextResponse.json({ error: 'Missing message or canvasData' }, { status: 400 });
        }
        if (message.length > MAX_MESSAGE_LENGTH || canvasData.length > MAX_CANVAS_LENGTH) {
            return NextResponse.json({ error: 'That message or drawing is too large. Try something shorter.' }, { status: 413 });
        }

        const base64Match = canvasData.match(/^data:image\/png;base64,(.+)$/);
        if (!base64Match || !base64Match[1]) {
            return NextResponse.json({ error: 'Invalid canvasData format. Expected data:image/png;base64,...' }, { status: 400 });
        }
        const base64Image = base64Match[1];

        const capResponse = await enforceDailyCap('collaborator', user.id);
        if (capResponse) return capResponse;

        const ai = new GoogleGenAI({ apiKey: API_KEY || '' });

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
            model: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
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
        return NextResponse.json({ error: 'The collaborator could not answer. Please try again.' }, { status: 500 });
    }
}
