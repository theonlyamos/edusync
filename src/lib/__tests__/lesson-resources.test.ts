import { describe, expect, it } from 'vitest'
import { mapLessonResource, normalizeResourceUrl, validateResourceFile } from '@/lib/lesson-resources'

describe('lesson resource files', () => {
  it('accepts supported files and returns the extension', () => {
    expect(validateResourceFile('Notes.PDF', 'application/pdf', 1000)).toBe('pdf')
    // Some browsers send no type for office files.
    expect(validateResourceFile('slides.pptx', '', 1000)).toBe('pptx')
  })

  it('rejects unsupported, mismatched, empty and oversized files', () => {
    expect(() => validateResourceFile('run.exe', 'application/x-msdownload', 10)).toThrow(/not supported/)
    expect(() => validateResourceFile('photo.png', 'application/pdf', 10)).toThrow(/does not match/)
    expect(() => validateResourceFile('empty.pdf', 'application/pdf', 0)).toThrow(/empty/)
    expect(() => validateResourceFile('big.mp4', 'video/mp4', 26 * 1024 * 1024)).toThrow(/25 MB/)
  })
})

describe('lesson resource links', () => {
  it('only accepts http and https links', () => {
    expect(normalizeResourceUrl(' https://example.com/a ')).toBe('https://example.com/a')
    expect(() => normalizeResourceUrl('javascript:alert(1)')).toThrow()
    expect(() => normalizeResourceUrl('example.com')).toThrow()
  })
})

describe('mapLessonResource', () => {
  const base = { id: 'r-1', lesson_id: 'l-1', title: 'Notes', description: '', created_at: '2026-10-22T10:00:00Z', url: null, storage_path: null, filename: null, mime_type: null, byte_size: null }

  it('sends files through the checked download route, never the storage path', () => {
    const mapped = mapLessonResource({ ...base, kind: 'file', storage_path: 'l-1/x.pdf', filename: 'notes.pdf', mime_type: 'application/pdf', byte_size: 10 })
    expect(mapped.fileUrl).toBe('/api/resources/r-1/download')
    expect(JSON.stringify(mapped)).not.toContain('l-1/x.pdf')
  })

  it('maps links to the older url type', () => {
    expect(mapLessonResource({ ...base, kind: 'link', url: 'https://example.com' })).toMatchObject({ type: 'url', url: 'https://example.com' })
  })
})
