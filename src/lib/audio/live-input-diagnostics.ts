export const LIVE_INPUT_DIAGNOSTIC_EVENT = 'insyte-live-input';

type LiveInputKind = 'audio' | 'text' | 'video' | 'tool';
type LiveInputSource = 'microphone' | 'user' | 'quiz' | 'initial' | 'viewport' | 'visual' | 'tool';
type LiveInputDiagnosticInput = { connectionGeneration: number } & (
    { event: 'sent'; kind: LiveInputKind; source: LiveInputSource; audioBytes?: number }
    | { event: 'server-interrupted' }
);

const sources: Record<LiveInputKind, readonly LiveInputSource[]> = {
    audio: ['microphone'], text: ['user', 'quiz', 'initial', 'viewport'], video: ['visual'], tool: ['tool'],
};

export function emitLiveInputDiagnostic(input: LiveInputDiagnosticInput) {
    try {
        if (!Number.isSafeInteger(input.connectionGeneration) || input.connectionGeneration < 0) return;
        const detail: Record<string, string | number> = {
            event: input.event, timestampMs: Date.now(), connectionGeneration: input.connectionGeneration,
        };
        if (input.event === 'sent') {
            if (!sources[input.kind]?.includes(input.source)) return;
            detail.kind = input.kind;
            detail.source = input.source;
            if (input.kind === 'audio' && Number.isSafeInteger(input.audioBytes) && input.audioBytes! >= 0) {
                detail.audioBytes = input.audioBytes!;
            }
        } else if (input.event !== 'server-interrupted') return;
        window.dispatchEvent(new CustomEvent(LIVE_INPUT_DIAGNOSTIC_EVENT, { detail }));
    } catch { return; }
}
