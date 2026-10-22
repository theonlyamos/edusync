// Shared rules for lesson resources (files and links on a lesson). Safe to import in the browser.

export const LESSON_RESOURCE_BUCKET = 'lesson-resources';
export const MAX_RESOURCE_BYTES = 25 * 1024 * 1024;

/** File extensions teachers may upload, with the MIME type each must carry. */
export const RESOURCE_FILE_TYPES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  txt: ['text/plain'],
  csv: ['text/csv', 'application/vnd.ms-excel'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  mp3: ['audio/mpeg'],
  mp4: ['video/mp4'],
};

export const RESOURCE_ACCEPT = Object.keys(RESOURCE_FILE_TYPES).map((ext) => `.${ext}`).join(',');

/** Checks a file before upload. Returns the extension, or throws a message a teacher can act on. */
export function validateResourceFile(filename: string, mimeType: string, size: number): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const allowed = RESOURCE_FILE_TYPES[ext];
  if (!allowed) throw new Error('That file type is not supported. Use PDF, Word, Excel, PowerPoint, text, image, MP3 or MP4.');
  // Browsers sometimes send an empty type for office files; fall back to the extension's type.
  if (mimeType && !allowed.includes(mimeType)) throw new Error('The file type does not match its extension.');
  if (!Number.isFinite(size) || size <= 0) throw new Error('The file is empty.');
  if (size > MAX_RESOURCE_BYTES) throw new Error('Files can be up to 25 MB.');
  return ext;
}

export function resourceMimeType(filename: string, mimeType: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return mimeType || RESOURCE_FILE_TYPES[ext]?.[0] || 'application/octet-stream';
}

/** Accepts only absolute http(s) links. Returns the normalised URL or throws. */
export function normalizeResourceUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a full link, starting with https://');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Links must start with http:// or https://');
  return url.toString();
}

export interface LessonResourceRow {
  id: string;
  lesson_id: string;
  kind: 'file' | 'link';
  title: string;
  description: string;
  url: string | null;
  storage_path: string | null;
  filename: string | null;
  mime_type: string | null;
  byte_size: number | null;
  created_at: string;
  lessons?: { title?: string | null } | null;
}

/** Shape the pages use. `type: 'url'` and `_id` match the older pages. */
export interface LessonResource {
  _id: string;
  id: string;
  lessonId: string;
  lessonTitle?: string;
  title: string;
  description: string;
  type: 'file' | 'url';
  url?: string;
  fileUrl?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  createdAt: string;
}

export function mapLessonResource(row: LessonResourceRow): LessonResource {
  const base = {
    _id: row.id,
    id: row.id,
    lessonId: row.lesson_id,
    lessonTitle: row.lessons?.title ?? undefined,
    title: row.title,
    description: row.description ?? '',
    createdAt: row.created_at,
  };
  if (row.kind === 'link') return { ...base, type: 'url', url: row.url ?? undefined };
  return {
    ...base,
    type: 'file',
    // Downloads go through the server so each one is checked and signed.
    fileUrl: `/api/resources/${row.id}/download`,
    filename: row.filename ?? undefined,
    mimeType: row.mime_type ?? undefined,
    size: row.byte_size ?? undefined,
  };
}

export function formatBytes(size?: number): string {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
