import { describe, it, expect } from 'vitest'
import {
  normalizeTranscriptionChunk,
  extractServerTranscriptions,
  mergeStreamingTranscript,
  LIVE_TRANSCRIPT_BUFFER_MAX_CHARS,
} from '@/lib/audio/transcription'

describe('normalizeTranscriptionChunk', () => {
  it('returns null for non-objects and empty chunks', () => {
    expect(normalizeTranscriptionChunk(null)).toBeNull()
    expect(normalizeTranscriptionChunk('x')).toBeNull()
    expect(normalizeTranscriptionChunk({})).toBeNull()
    expect(normalizeTranscriptionChunk({ text: '', finished: false })).toBeNull()
  })

  it('extracts text and finished', () => {
    expect(normalizeTranscriptionChunk({ text: 'hi', finished: false })).toEqual({ text: 'hi', finished: false })
    expect(normalizeTranscriptionChunk({ text: '', finished: true })).toEqual({ text: '', finished: true })
  })
})

describe('extractServerTranscriptions', () => {
  it('reads camelCase fields', () => {
    const r = extractServerTranscriptions({
      inputTranscription: { text: 'u', finished: false },
      outputTranscription: { text: 'a', finished: true },
    })
    expect(r.input).toEqual({ text: 'u', finished: false })
    expect(r.output).toEqual({ text: 'a', finished: true })
  })

  it('falls back to snake_case fields', () => {
    const r = extractServerTranscriptions({
      input_audio_transcription: { text: 'u', finished: false },
      output_audio_transcription: { text: 'a', finished: false },
    })
    expect(r.input?.text).toBe('u')
    expect(r.output?.text).toBe('a')
  })

  it('returns nulls for invalid input', () => {
    expect(extractServerTranscriptions(null)).toEqual({ input: null, output: null })
  })
})

describe('mergeStreamingTranscript', () => {
  it('handles empty operands', () => {
    expect(mergeStreamingTranscript('', '')).toBe('')
    expect(mergeStreamingTranscript('hello', '')).toBe('hello')
    expect(mergeStreamingTranscript('', 'world')).toBe('world')
  })

  it('prefers the longer when one is a prefix of the other (streaming growth)', () => {
    expect(mergeStreamingTranscript('the quick', 'the quick brown')).toBe('the quick brown')
    expect(mergeStreamingTranscript('the quick brown', 'the quick')).toBe('the quick brown')
  })

  it('is idempotent for equal chunks', () => {
    expect(mergeStreamingTranscript('same', 'same')).toBe('same')
  })

  it('keeps prev when it already ends with the incoming chunk', () => {
    expect(mergeStreamingTranscript('a b c', 'c')).toBe('a b c')
  })

  it('dedupes a shared boundary word', () => {
    // last word of a ("brown") equals first word of b ("brown")
    expect(mergeStreamingTranscript('the quick brown', 'brown fox')).toBe('the quick brown fox')
  })

  it('concatenates disjoint chunks with a single space', () => {
    expect(mergeStreamingTranscript('hello', 'there')).toBe('hello there')
  })

  it('normalizes whitespace', () => {
    expect(mergeStreamingTranscript('  hello   ', '  there  ')).toBe('hello there')
  })

  it('caps the buffer length', () => {
    const big = 'x'.repeat(LIVE_TRANSCRIPT_BUFFER_MAX_CHARS + 500)
    expect(mergeStreamingTranscript(big, 'y').length).toBe(LIVE_TRANSCRIPT_BUFFER_MAX_CHARS)
  })
})
