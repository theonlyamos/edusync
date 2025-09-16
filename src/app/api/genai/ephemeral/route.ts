import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY environment variable not set' },
                { status: 500 }
            );
        }

        const ai = new GoogleGenAI({ apiKey });

        const now = new Date();
        const expireTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
        const newSessionExpireTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes for new sessions

        // Create ephemeral token with locked configuration and session resumption
        const token = await (ai as any).authTokens.create({
            config: {
                uses: 1,
                expireTime: expireTime.toISOString(),
                newSessionExpireTime: newSessionExpireTime.toISOString(),
                httpOptions: { apiVersion: 'v1alpha' }
            }
        });

        return NextResponse.json({
            token: token.name,
            expireTime: expireTime.toISOString(),
            newSessionExpireTime: newSessionExpireTime.toISOString()
        });

    } catch (error: any) {
        console.error('Failed to create ephemeral token:', error);
        return NextResponse.json(
            { error: 'Failed to create ephemeral token', details: error.message },
            { status: 500 }
        );
    }
}
