import { GoogleGenAI } from '@google/genai';

export interface GeneratedImageBinary {
  bytes: Buffer;
  mimeType: string;
  caption: string;
}

export function extractGeneratedImage(response: any): GeneratedImageBinary {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) throw new Error('Image provider returned no content');

  const image = parts.find((part: any) => part?.inlineData?.data);
  if (!image?.inlineData?.data) throw new Error('Image provider returned no image');
  const caption = parts
    .filter((part: any) => typeof part?.text === 'string')
    .map((part: any) => part.text.trim())
    .filter(Boolean)
    .join(' ');

  return {
    bytes: Buffer.from(image.inlineData.data, 'base64'),
    mimeType: image.inlineData.mimeType || 'image/png',
    caption: caption || 'Teacher-reviewed educational illustration.',
  };
}

export async function generateGeminiLessonImage(prompt: string): Promise<GeneratedImageBinary> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is required for image generation');
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
    contents: prompt,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: '4:3' },
    },
  } as any);
  return extractGeneratedImage(response);
}
