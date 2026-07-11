import { describe, expect, it } from 'vitest';

import { splitGroundingText, validateLessonMedia, validateLessonMediaBytes } from '../media';

describe('lesson media ingestion', () => {
  it('accepts the supported teacher upload formats and rejects oversized or executable files', () => {
    expect(validateLessonMedia({ name: 'diagram.png', type: 'image/png', size: 100 })).toEqual(expect.objectContaining({ mimeType: 'image/png' }));
    expect(validateLessonMedia({ name: 'slides.pptx', type: '', size: 100 })).toEqual(expect.objectContaining({ mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }));
    expect(() => validateLessonMedia({ name: 'malware.exe', type: 'application/octet-stream', size: 100 })).toThrow(/supported/i);
    expect(() => validateLessonMedia({ name: 'diagram.png', type: 'image/jpeg', size: 100 })).toThrow(/match/i);
    expect(() => validateLessonMedia({ name: 'huge.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 + 1 })).toThrow(/10 mb/i);
  });

  it('checks file signatures before private storage', () => {
    expect(() => validateLessonMediaBytes(Buffer.from('%PDF-1.7'), 'application/pdf')).not.toThrow();
    expect(() => validateLessonMediaBytes(Buffer.from('not a pdf'), 'application/pdf')).toThrow(/signature/i);
  });

  it('splits extracted text into bounded, overlapping grounding chunks', () => {
    const text = Array.from({ length: 100 }, (_, index) => `Sentence ${index} explains the lesson concept.`).join(' ');
    const chunks = splitGroundingText(text, 300, 40);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.text.length <= 300)).toBe(true);
    expect(chunks.map((chunk) => chunk.position)).toEqual(chunks.map((_, index) => index));
  });
});
