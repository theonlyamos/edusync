export type PlaybackDiagnostic = {
    event: 'buffering' | 'scheduled' | 'underrun' | 'interrupted' | 'stopped' | 'turn-complete' | 'generation-complete' | 'drained' | 'resume-failed' | 'playback-failed';
    timestampMs: number;
    contextTime: number;
    bufferedMs: number;
    pendingMs: number;
    receivedChunks: number;
    scheduledChunks: number;
    underruns: number;
    interruptions: number;
    generation: number;
    gapMs?: number;
};

type PlaybackOptions = {
    connect: (source: AudioBufferSourceNode) => void;
    onSamples?: (samples: Float32Array) => void;
    onPlayingChange?: (playing: boolean) => void;
    onDiagnostic?: (diagnostic: PlaybackDiagnostic) => void;
};

export class PcmPlaybackQueue {
    private readonly sampleRate = 24000;
    private readonly initialBuffer = 0.1;
    private pending: Float32Array[] = [];
    private pendingSeconds = 0;
    private sources = new Set<AudioBufferSourceNode>();
    private nextTime = 0;
    private generation = 0;
    private disposed = false;
    private playing = false;
    private turnOpen = false;
    private scheduledInTurn = false;
    private starved = false;
    private resuming: Promise<void> | null = null;
    private receivedChunks = 0;
    private scheduledChunks = 0;
    private underruns = 0;
    private interruptions = 0;

    constructor(private readonly context: AudioContext, private readonly options: PlaybackOptions) {}

    enqueue(base64: string) {
        if (this.disposed || this.context.state === 'closed') return;
        const generation = this.generation;
        const binary = atob(base64);
        if (!binary.length) return;
        if (binary.length % 2) throw new Error('Invalid PCM16 audio length');
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        const view = new DataView(bytes.buffer);
        const samples = new Float32Array(bytes.length / 2);
        for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true) / 32768;
        if (!this.turnOpen) this.scheduledInTurn = false;
        this.turnOpen = true;
        this.receivedChunks++;
        this.pending.push(samples);
        this.pendingSeconds += samples.length / this.sampleRate;
        this.notify(() => this.options.onSamples?.(samples));
        if (this.disposed || generation !== this.generation) return;
        this.setPlaying(true);
        this.flush();
    }

    completeTurn(reason: 'turn-complete' | 'generation-complete' = 'turn-complete') {
        if (this.disposed) return;
        this.turnOpen = false;
        this.emit(reason);
        this.flush();
    }

    interrupt() {
        if (this.disposed) return;
        this.interruptions++;
        this.clear();
        this.emit('interrupted');
    }

    stop() {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        this.emit('stopped');
    }

    isIdle() {
        return this.disposed || this.context.state === 'closed' || (!this.pending.length && !this.sources.size);
    }

    private flush() {
        try {
            this.schedulePending();
        } catch {
            this.clear();
            this.emit('playback-failed');
        }
    }

    private schedulePending() {
        if (this.disposed || !this.pending.length || this.context.state === 'closed') return;
        if (this.context.state !== 'running') {
            if (this.resuming) return;
            const generation = this.generation;
            this.emit('buffering');
            if (this.disposed || generation !== this.generation) return;
            try {
                const resume = this.context.resume();
                this.resuming = resume;
                void resume.then(() => {
                    if (this.disposed || generation !== this.generation) return;
                    this.resuming = null;
                    if (this.context.state === 'running') this.flush();
                    else this.emit('resume-failed');
                }, () => {
                    if (this.disposed || generation !== this.generation) return;
                    this.resuming = null;
                    this.emit('resume-failed');
                });
            } catch {
                this.resuming = null;
                this.emit('resume-failed');
            }
            return;
        }
        const generation = this.generation;
        while (!this.disposed && generation === this.generation && this.pending.length) {
            const samples = this.pending.shift()!;
            this.pendingSeconds = Math.max(0, this.pendingSeconds - samples.length / this.sampleRate);
            const buffer = this.context.createBuffer(1, samples.length, this.sampleRate);
            buffer.getChannelData(0).set(samples);
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            this.sources.add(source);
            this.options.connect(source);
            if (this.disposed || generation !== this.generation) return;
            const now = this.context.currentTime;
            let startAt = this.nextTime;
            if (startAt <= now) {
                if (this.scheduledInTurn && !this.starved) this.underflow(Math.max(0, now - this.nextTime));
                startAt = now + this.initialBuffer;
                this.emit('buffering');
            }
            if (this.disposed || generation !== this.generation) return;
            source.onended = () => {
                if (this.disposed || generation !== this.generation) return;
                this.sources.delete(source);
                source.disconnect();
                if (!this.sources.size && !this.pending.length) {
                    this.setPlaying(false);
                    if (this.disposed || generation !== this.generation) return;
                    if (this.turnOpen && !this.starved) this.underflow(0);
                    else this.emit('drained');
                }
            };
            source.start(startAt);
            this.nextTime = startAt + buffer.duration;
            this.scheduledInTurn = true;
            this.starved = false;
            this.scheduledChunks++;
            this.emit('scheduled');
        }
    }

    private clear() {
        this.generation++;
        this.resuming = null;
        this.pending.length = 0;
        this.pendingSeconds = 0;
        for (const source of this.sources) {
            source.onended = null;
            try { source.stop(); } catch { source.onended = null; }
            source.disconnect();
        }
        this.sources.clear();
        this.nextTime = this.context.currentTime;
        this.turnOpen = false;
        this.scheduledInTurn = false;
        this.starved = false;
        this.setPlaying(false);
    }

    private underflow(gap: number) {
        this.starved = true;
        this.underruns++;
        this.emit('underrun', gap * 1000);
    }

    private setPlaying(playing: boolean) {
        if ((this.disposed && playing) || this.playing === playing) return;
        this.playing = playing;
        this.notify(() => this.options.onPlayingChange?.(playing));
    }

    private emit(event: PlaybackDiagnostic['event'], gapMs?: number) {
        const diagnostic: PlaybackDiagnostic = {
            event, timestampMs: Date.now(), contextTime: this.context.currentTime,
            bufferedMs: Math.max(0, this.nextTime - this.context.currentTime) * 1000,
            pendingMs: this.pendingSeconds * 1000,
            receivedChunks: this.receivedChunks, scheduledChunks: this.scheduledChunks,
            underruns: this.underruns, interruptions: this.interruptions, generation: this.generation,
            ...(gapMs === undefined ? {} : { gapMs }),
        };
        this.notify(() => this.options.onDiagnostic?.(diagnostic));
    }

    private notify(callback: () => void) {
        try { callback(); } catch { return; }
    }
}
