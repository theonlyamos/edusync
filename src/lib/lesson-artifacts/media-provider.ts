import { GoogleGenAI } from '@google/genai';

const client = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is required for media grounding');
  return new GoogleGenAI({ apiKey });
};

export async function extractMediaText(bytes: Buffer, mimeType: string, filename: string) {
  if (mimeType === 'text/plain' || mimeType === 'text/csv') {
    return bytes.toString('utf8').replace(/\u0000/g, '').trim();
  }
  const response: any = await client().models.generateContent({
    model: process.env.GEMINI_EXTRACTION_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        { text: `Extract the educational content from ${filename}. Preserve headings, table relationships, slide order, labels, and important image text. Return plain text only; do not add facts.` },
        { inlineData: { mimeType, data: bytes.toString('base64') } },
      ],
    }],
  } as any);
  const text = typeof response.text === 'string'
    ? response.text
    : response?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('\n');
  if (!text?.trim()) throw new Error('No educational text could be extracted from this file');
  return text.replace(/\u0000/g, '').trim();
}

export async function embedGroundingText(text: string): Promise<number[]> {
  return (await embedGroundingTexts([text]))[0];
}

export async function embedGroundingTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const response: any = await client().models.embedContent({
    model: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    contents: texts,
    config: { outputDimensionality: 1536 },
  } as any);
  const embeddings = response?.embeddings ?? (response?.embedding ? [response.embedding] : []);
  const values = embeddings.map((embedding: any) => embedding?.values);
  if (values.length !== texts.length || values.some((vector: unknown) => !Array.isArray(vector) || vector.length !== 1536)) {
    throw new Error('Embedding provider returned an invalid vector batch');
  }
  return values;
}
