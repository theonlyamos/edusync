export const MAX_LESSON_MEDIA_BYTES = 10 * 1024 * 1024;

const mimeByExtension: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const supportedMimes = new Set(Object.values(mimeByExtension));

export function validateLessonMedia(file: { name: string; type: string; size: number }) {
  if (file.size <= 0) throw new Error('The uploaded file is empty');
  if (file.size > MAX_LESSON_MEDIA_BYTES) throw new Error('Lesson media must be 10 MB or smaller');
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const expectedMime = mimeByExtension[extension];
  if (!expectedMime || (file.type && !supportedMimes.has(file.type))) {
    throw new Error('Supported formats: images, PDF, DOCX, PPTX, TXT, CSV, and XLSX');
  }
  if (file.type && file.type !== expectedMime) throw new Error('The file extension and MIME type do not match');
  return { extension, mimeType: expectedMime };
}

const beginsWith = (bytes: Uint8Array, signature: number[]) => signature.every((value, index) => bytes[index] === value);

export function validateLessonMediaBytes(bytes: Uint8Array, mimeType: string) {
  const valid = (() => {
    if (mimeType === 'image/png') return beginsWith(bytes, [0x89, 0x50, 0x4e, 0x47]);
    if (mimeType === 'image/jpeg') return beginsWith(bytes, [0xff, 0xd8, 0xff]);
    if (mimeType === 'image/gif') return beginsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
    if (mimeType === 'image/webp') return beginsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (mimeType === 'application/pdf') return beginsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
    if (mimeType.includes('officedocument')) return beginsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    if (mimeType === 'text/plain' || mimeType === 'text/csv') return !bytes.slice(0, 1024).includes(0);
    return false;
  })();
  if (!valid) throw new Error('The uploaded file signature does not match its declared format');
}

export function splitGroundingText(text: string, maxCharacters = 1_200, overlapCharacters = 160) {
  if (maxCharacters < 100 || overlapCharacters < 0 || overlapCharacters >= maxCharacters) {
    throw new Error('Invalid grounding chunk dimensions');
  }
  const normalized = text.replace(/\s+/g, ' ').trim();
  const chunks: Array<{ position: number; text: string }> = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxCharacters, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(' ', end);
      if (boundary > start + maxCharacters / 2) end = boundary;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push({ position: chunks.length, text: chunk });
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlapCharacters);
  }
  return chunks;
}
