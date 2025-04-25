import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client - Ensure API key is set in environment variables
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to fetch image data from URL and return as Buffer
async function fetchImageBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image from ${url}: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

export async function POST(request: Request) {
    try {
        const { prompt, inputImageUrls } = await request.json();

        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        let response;

        if (inputImageUrls && inputImageUrls.length > 0) {
            // Edit existing images
            if (inputImageUrls.length > 1) {
                return NextResponse.json({ error: 'OpenAI image editing currently supports only one input image.' }, { status: 400 });
            }
            const imageBuffer = await fetchImageBuffer(inputImageUrls[0]);
            // The SDK expects an object with specific properties for the image file
            const imageFile = {
                file: imageBuffer,
                name: 'input.png', // Required name field
            };

            response = await openai.images.edit({
                model: 'dall-e-2', // Using dall-e-2 as gpt-image-1 is not a valid model for editing
                image: imageFile as any, // Cast to any to match SDK expectation temporarily
                prompt,
                n: 1,
                response_format: 'b64_json',
            });
        } else {
            // Generate a new image
            response = await openai.images.generate({
                model: 'dall-e-3', // Using dall-e-3 for generation
                prompt,
                n: 1,
                response_format: 'b64_json',
            });
        }

        const b64Json = response.data[0]?.b64_json;

        if (!b64Json) {
            return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
        }

        const dataUrl = `data:image/png;base64,${b64Json}`;
        return NextResponse.json({ dataUrl });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
} 