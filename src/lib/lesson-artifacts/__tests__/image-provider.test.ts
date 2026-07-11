import { describe, expect, it } from 'vitest';

import { extractGeneratedImage } from '../image-provider';

describe('Gemini image response parsing', () => {
  it('extracts the first inline image and accompanying caption', () => {
    const result = extractGeneratedImage({
      candidates: [
        {
          content: {
            parts: [
              { text: 'A labeled force diagram.' },
              { inlineData: { mimeType: 'image/png', data: Buffer.from('image').toString('base64') } },
            ],
          },
        },
      ],
    });

    expect(result.mimeType).toBe('image/png');
    expect(result.bytes.toString()).toBe('image');
    expect(result.caption).toBe('A labeled force diagram.');
  });
});
