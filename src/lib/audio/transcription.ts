/**
 * Pure helpers for Gemini Live transcription handling. Extracted verbatim from
 * useAudioStreaming so the merge/normalize logic can be unit-tested in isolation.
 */

export function normalizeTranscriptionChunk(raw: unknown): { text: string; finished: boolean } | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const text = typeof o.text === 'string' ? o.text : '';
    const finished = Boolean(o.finished);
    if (!text && !finished) return null;
    return { text, finished };
}

/** Resolve Live transcription blobs from serverContent (camelCase + snake_case fallbacks). */
export function extractServerTranscriptions(serverContent: unknown): {
    input: { text: string; finished: boolean } | null;
    output: { text: string; finished: boolean } | null;
} {
    if (!serverContent || typeof serverContent !== 'object') return { input: null, output: null };
    const sc = serverContent as Record<string, unknown>;
    const inputRaw = sc.inputTranscription ?? sc.input_audio_transcription;
    const outputRaw = sc.outputTranscription ?? sc.output_audio_transcription;
    return {
        input: normalizeTranscriptionChunk(inputRaw),
        output: normalizeTranscriptionChunk(outputRaw),
    };
}

/** Merge streaming transcription chunks; caps length to limit damage from pathological streams. */
export const LIVE_TRANSCRIPT_BUFFER_MAX_CHARS = 32_000;

export function mergeStreamingTranscript(prev: string, incoming: string): string {
    const cap = (s: string) =>
        s.length <= LIVE_TRANSCRIPT_BUFFER_MAX_CHARS ? s : s.slice(0, LIVE_TRANSCRIPT_BUFFER_MAX_CHARS);

    const a = prev.replace(/\s+/g, ' ').trim();
    const b = incoming.replace(/\s+/g, ' ').trim();
    if (!b) return cap(a);
    if (!a) return cap(b);

    if (b.startsWith(a)) return cap(b);
    if (a.startsWith(b)) return cap(a);
    if (a === b) return cap(a);
    if (a.endsWith(b)) return cap(a);

    const stripEnds = (w: string) => w.replace(/^[.,!?;:]+|[.,!?;:]+$/g, '').toLowerCase();
    const aWords = a.split(/\s+/).filter(Boolean);
    const bWords = b.split(/\s+/).filter(Boolean);
    if (bWords.length > 0 && aWords.length > 0) {
        const lastA = stripEnds(aWords[aWords.length - 1] ?? '');
        const firstB = stripEnds(bWords[0] ?? '');
        if (lastA && firstB && lastA === firstB) {
            const base = aWords.slice(0, -1).join(' ');
            const merged = base ? `${base} ${b}`.replace(/\s+/g, ' ').trim() : b;
            return cap(merged);
        }
    }

    return cap(`${a} ${b}`.replace(/\s+/g, ' ').trim());
}
