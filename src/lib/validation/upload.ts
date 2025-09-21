import { z } from 'zod';

// Define allowed file types and their MIME types
export const ALLOWED_FILE_TYPES = {
    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',

    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',

    // Spreadsheets
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',

    // Presentations
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const uploadSchema = z.object({
    filename: z.string().min(1).max(255),
    size: z.number().min(1).max(MAX_FILE_SIZE),
    type: z.string().refine(
        (type) => Object.values(ALLOWED_FILE_TYPES).includes(type as any),
        { message: 'File type not allowed' }
    ),
});

export function sanitizeFilename(filename: string): string {
    // Remove any directory traversal attempts
    const sanitized = filename
        .replace(/\.\./g, '')
        .replace(/[\/\\]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');

    // Ensure it has a valid extension
    const parts = sanitized.split('.');
    if (parts.length < 2) {
        return `${sanitized}.txt`;
    }

    return sanitized;
}

export function validateFileExtension(filename: string, mimeType: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext) return false;

    const expectedMime = ALLOWED_FILE_TYPES[ext as keyof typeof ALLOWED_FILE_TYPES];
    return expectedMime === mimeType;
}
