import { describe, expect, it } from 'vitest';
import { PcmPlaybackQueue, type PlaybackDiagnostic } from '../pcm-playback-queue';

class SyntheticBuffer {
  readonly channels: Float32Array[];
  readonly duration: number;

  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    this.duration = length / sampleRate;
  }

  getChannelData(channel: number) { return this.channels[channel]; }
  copyToChannel(samples: Float32Array, channel: number, offset = 0) { this.channels[channel].set(samples, offset); }
}

class SyntheticSource extends EventTarget {
  buffer: AudioBuffer | null = null;
  onended: ((event: Event) => void) | null = null;
  startAt: number | undefined;
  stopped = false;
  disconnected = false;
  ended = false;
  connections: unknown[] = [];

  constructor(readonly context: SyntheticContext) { super(); }

  connect(destination: unknown) { this.connections.push(destination); return destination; }
  disconnect() { this.disconnected = true; this.connections = []; }
  start(time = 0) {
    if (this.context.startError) throw this.context.startError;
    if (this.startAt !== undefined || !Number.isFinite(time) || time < 0) throw new Error('Invalid source start');
    this.startAt = time;
  }
  stop() { this.stopped = true; }
  finish() {
    if (this.ended) return;
    this.ended = true;
    const event = new Event('ended');
    this.onended?.(event);
    this.dispatchEvent(event);
  }
}

class SyntheticContext extends EventTarget {
  currentTime = 0;
  state: AudioContextState = 'running';
  readonly sampleRate = 48000;
  readonly destination = { context: this };
  readonly sources: SyntheticSource[] = [];
  readonly resumptions: { promise: Promise<void>; resolve(): void; reject(error: Error): void }[] = [];
  onstatechange: ((event: Event) => void) | null = null;
  startError: Error | null = null;

  createBuffer(channels: number, length: number, sampleRate: number) {
    return new SyntheticBuffer(channels, length, sampleRate) as unknown as AudioBuffer;
  }
  createBufferSource() {
    const source = new SyntheticSource(this);
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
  resume() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
    this.resumptions.push({ promise, resolve, reject });
    return promise;
  }
  setState(state: AudioContextState) {
    this.state = state;
    const event = new Event('statechange');
    this.onstatechange?.(event);
    this.dispatchEvent(event);
  }
  resolveResume(index = 0) {
    this.setState('running');
    this.resumptions[index].resolve();
  }
  close() { this.setState('closed'); return Promise.resolve(); }
  advanceTo(time: number) {
    this.currentTime = time;
    for (const source of this.sources) {
      if (!source.stopped && !source.ended && source.startAt !== undefined && source.buffer && source.startAt + source.buffer.duration <= time + 1e-9) source.finish();
    }
  }
}

function pcm(values: readonly number[]) {
  const bytes = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => bytes.writeInt16LE(value, index * 2));
  return bytes.toString('base64');
}

function harness(context = new SyntheticContext()) {
  const samples: number[][] = [];
  const playing: boolean[] = [];
  const diagnostics: PlaybackDiagnostic[] = [];
  const queue = new PcmPlaybackQueue(context as unknown as AudioContext, {
    connect: source => { source.connect(context.destination as unknown as AudioNode); },
    onSamples: value => samples.push(Array.from(value)),
    onPlayingChange: value => playing.push(value),
    onDiagnostic: value => diagnostics.push(value),
  });
  return { queue, context, samples, playing, diagnostics };
}

const scheduled = (context: SyntheticContext) => context.sources.filter(source => source.startAt !== undefined);
const settlePromises = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('PCM playback queue', () => {
  it('decodes little-endian PCM16 samples synchronously in receive order at 24 kHz', () => {
    const h = harness();
    h.queue.enqueue(pcm([-32768, -16384, 0]));
    h.queue.enqueue(pcm([16384, 32767]));
    expect(h.samples.flat()).toEqual([-1, -0.5, 0, 0.5, 0.999969482421875]);
    const sources = scheduled(h.context);
    expect(sources.flatMap(source => Array.from(source.buffer!.getChannelData(0)))).toEqual([-1, -0.5, 0, 0.5, 0.999969482421875]);
    expect(sources.every(source => source.buffer!.sampleRate === 24000 && source.buffer!.numberOfChannels === 1)).toBe(true);
    expect(sources.every(source => source.connections.includes(h.context.destination))).toBe(true);
    h.queue.stop();
  });

  it('plays a final buffer smaller than the initial lead without dropping samples or declaring early idle', () => {
    const h = harness();
    expect(h.queue.isIdle()).toBe(true);
    h.queue.enqueue(pcm([4096, 8192, 12288, 16384]));
    h.queue.completeTurn();
    const source = scheduled(h.context)[0];
    expect(Array.from(source.buffer!.getChannelData(0))).toEqual([0.125, 0.25, 0.375, 0.5]);
    expect(source.startAt).toBeCloseTo(0.1, 9);
    expect(h.queue.isIdle()).toBe(false);
    h.context.advanceTo(0.1 + 4 / 24000);
    expect(h.queue.isIdle()).toBe(true);
  });

  it('appends audio ready 20 ms before the scheduled tail without inserting a scheduling gap', () => {
    const h = harness();
    h.queue.enqueue(pcm(new Array(24000).fill(16384)));
    expect(scheduled(h.context)[0].startAt).toBeCloseTo(0.1, 9);
    h.context.currentTime = 1.08;
    h.queue.enqueue(pcm(new Array(2400).fill(-16384)));
    const sources = scheduled(h.context);
    expect(sources[1].startAt).toBeCloseTo(1.1, 9);
    expect(h.diagnostics.filter(event => event.event === 'underrun')).toHaveLength(0);
    h.queue.completeTurn();
    h.context.advanceTo(1.2);
    expect(h.queue.isIdle()).toBe(true);
  });

  it('counts an open-turn drain once and adds a fresh lead when delayed audio arrives', () => {
    const h = harness();
    h.queue.enqueue(pcm(new Array(24000).fill(0)));
    h.context.advanceTo(1.1);
    expect(h.diagnostics.filter(event => event.event === 'underrun')).toHaveLength(1);
    h.context.currentTime = 1.3;
    h.queue.enqueue(pcm(new Array(2400).fill(0)));
    expect(scheduled(h.context)[1].startAt).toBeCloseTo(1.4, 9);
    expect(h.diagnostics.filter(event => event.event === 'underrun')).toHaveLength(1);
    h.queue.completeTurn();
    h.context.advanceTo(1.5);
  });

  it.each(['turn-complete', 'generation-complete'] as const)('treats silence after %s as a normal boundary rather than an underrun', reason => {
    const h = harness();
    h.queue.enqueue(pcm(new Array(2400).fill(0)));
    h.queue.completeTurn(reason);
    h.context.advanceTo(0.2);
    expect(h.queue.isIdle()).toBe(true);
    h.context.currentTime = 10;
    h.queue.enqueue(pcm([16384]));
    expect(scheduled(h.context)[1].startAt).toBeCloseTo(10.1, 9);
    expect(h.diagnostics.filter(event => event.event === 'underrun')).toHaveLength(0);
    h.queue.completeTurn();
    h.context.advanceTo(10.2);
  });

  it('holds PCM while suspended and preserves the final short buffer through resumption', async () => {
    const context = new SyntheticContext();
    context.state = 'suspended';
    const h = harness(context);
    h.queue.enqueue(pcm([8192, 16384]));
    h.queue.enqueue(pcm([-8192, -16384]));
    h.queue.completeTurn();
    expect(scheduled(context)).toHaveLength(0);
    expect(h.queue.isIdle()).toBe(false);
    context.resolveResume();
    await settlePromises();
    const sources = scheduled(context);
    expect(sources.flatMap(source => Array.from(source.buffer!.getChannelData(0)))).toEqual([0.25, 0.5, -0.25, -0.5]);
    expect(sources[0].startAt).toBeCloseTo(0.1, 9);
    expect(h.queue.isIdle()).toBe(false);
    context.advanceTo(0.2);
    expect(h.queue.isIdle()).toBe(true);
    expect(h.diagnostics.filter(event => event.event === 'underrun')).toHaveLength(0);
  });

  it('stops and disconnects interrupted sources while reusing the running context for the next turn', () => {
    const h = harness();
    h.queue.enqueue(pcm(new Array(24000).fill(16384)));
    h.queue.enqueue(pcm(new Array(24000).fill(-16384)));
    const interrupted = scheduled(h.context).slice();
    h.context.currentTime = 0.2;
    h.queue.interrupt();
    expect(interrupted.every(source => source.stopped && source.disconnected)).toBe(true);
    expect(h.queue.isIdle()).toBe(true);
    expect(h.context.state).toBe('running');
    h.queue.enqueue(pcm([8192]));
    expect(scheduled(h.context)[2].startAt).toBeCloseTo(0.3, 9);
    expect(h.samples.at(-1)).toEqual([0.25]);
    h.queue.stop();
  });

  it('ignores an old ended callback after a new turn has started', () => {
    const h = harness();
    h.queue.enqueue(pcm(new Array(2400).fill(0)));
    const oldSource = scheduled(h.context)[0];
    const ended = oldSource.onended;
    h.queue.interrupt();
    h.queue.enqueue(pcm(new Array(2400).fill(16384)));
    const before = h.playing.slice();
    ended?.(new Event('ended'));
    oldSource.finish();
    expect(h.queue.isIdle()).toBe(false);
    expect(h.playing).toEqual(before);
    expect(scheduled(h.context)[1].stopped).toBe(false);
    h.queue.stop();
  });

  it('does not replay interrupted PCM or strand a new turn when an old resume resolves', async () => {
    const context = new SyntheticContext();
    context.state = 'suspended';
    const h = harness(context);
    h.queue.enqueue(pcm([16384]));
    h.queue.interrupt();
    h.queue.enqueue(pcm([-16384]));
    h.queue.completeTurn();
    context.resolveResume(0);
    await settlePromises();
    for (let index = 1; index < context.resumptions.length; index++) context.resolveResume(index);
    await settlePromises();
    expect(scheduled(context).flatMap(source => Array.from(source.buffer!.getChannelData(0)))).toEqual([-0.5]);
    expect(h.queue.isIdle()).toBe(false);
    context.advanceTo(0.2);
    expect(h.queue.isIdle()).toBe(true);
  });

  it('keeps stop terminal even when a pending resume settles and more PCM arrives', async () => {
    const context = new SyntheticContext();
    context.state = 'suspended';
    const h = harness(context);
    h.queue.enqueue(pcm([16384]));
    h.queue.stop();
    const before = h.playing.slice();
    context.resolveResume();
    await settlePromises();
    h.queue.enqueue(pcm([-16384]));
    h.queue.completeTurn();
    expect(scheduled(context)).toHaveLength(0);
    expect(h.queue.isIdle()).toBe(true);
    expect(h.playing).toEqual(before);
  });

  it('stops scheduled sources immediately and rejects further audio after terminal stop', () => {
    const h = harness();
    h.queue.enqueue(pcm(new Array(2400).fill(16384)));
    const source = scheduled(h.context)[0];
    h.queue.stop();
    h.queue.enqueue(pcm([-16384]));
    expect(source.stopped && source.disconnected).toBe(true);
    expect(scheduled(h.context)).toHaveLength(1);
    expect(h.queue.isIdle()).toBe(true);
  });

  it('honors a stop requested by a buffering diagnostic before any source starts', () => {
    const context = new SyntheticContext();
    const queue: PcmPlaybackQueue = new PcmPlaybackQueue(context as unknown as AudioContext, {
      connect: source => { source.connect(context.destination as unknown as AudioNode); },
      onDiagnostic: event => { if (event.event === 'buffering') queue.stop(); },
    });
    queue.enqueue(pcm([16384]));
    expect(scheduled(context)).toHaveLength(0);
    expect(context.sources.every(source => source.disconnected)).toBe(true);
    expect(queue.isIdle()).toBe(true);
  });

  it('does not restore playing state after the sample listener interrupts that audio', () => {
    const context = new SyntheticContext();
    const playing: boolean[] = [];
    const queue: PcmPlaybackQueue = new PcmPlaybackQueue(context as unknown as AudioContext, {
      connect: source => { source.connect(context.destination as unknown as AudioNode); },
      onSamples: samples => { if (samples[0] > 0) queue.interrupt(); },
      onPlayingChange: value => playing.push(value),
    });
    queue.enqueue(pcm([16384]));
    expect(scheduled(context)).toHaveLength(0);
    expect(playing).not.toContain(true);
    expect(queue.isIdle()).toBe(true);
    queue.enqueue(pcm([-16384]));
    expect(scheduled(context).flatMap(source => Array.from(source.buffer!.getChannelData(0)))).toEqual([-0.5]);
    queue.stop();
  });

  it('clears pending playback safely when a resumed context cannot start its audio source', async () => {
    const context = new SyntheticContext();
    context.state = 'suspended';
    context.startError = new Error('PRIVATE_START_ERROR_audio_device_url');
    const h = harness(context);
    h.queue.enqueue(pcm([16384, -16384]));
    context.resolveResume();
    await settlePromises();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(h.queue.isIdle()).toBe(true);
    expect(h.playing.at(-1)).toBe(false);
    expect(context.sources.every(source => source.disconnected)).toBe(true);
    expect(scheduled(context)).toHaveLength(0);
    expect(h.diagnostics.some(event => event.event === 'playback-failed')).toBe(true);
    expect(JSON.stringify(h.diagnostics)).not.toContain('PRIVATE_START_ERROR');
    h.queue.stop();
  });

  it('reports local numeric diagnostics without PCM, text, identifiers, or native error details', async () => {
    const context = new SyntheticContext();
    context.state = 'suspended';
    const h = harness(context);
    const payload = pcm([12345, -23456, 2345, -3456]);
    h.queue.enqueue(payload);
    context.resumptions[0].reject(new Error('PRIVATE_NATIVE_ERROR_credential_url_transcript'));
    await settlePromises();
    expect(h.diagnostics.some(event => event.event === 'resume-failed')).toBe(true);
    const fields = new Set(['event', 'timestampMs', 'contextTime', 'bufferedMs', 'pendingMs', 'receivedChunks', 'scheduledChunks', 'underruns', 'interruptions', 'generation', 'gapMs']);
    const events = ['buffering', 'scheduled', 'underrun', 'interrupted', 'stopped', 'turn-complete', 'generation-complete', 'drained', 'resume-failed', 'playback-failed'];
    for (const diagnostic of h.diagnostics) {
      expect(Object.keys(diagnostic).every(key => fields.has(key))).toBe(true);
      for (const [field, value] of Object.entries(diagnostic)) {
        if (field === 'event') expect(events).toContain(value);
        else { expect(typeof value).toBe('number'); expect(Number.isFinite(value)).toBe(true); }
      }
    }
    expect(JSON.stringify(h.diagnostics)).not.toContain(payload);
    expect(JSON.stringify(h.diagnostics)).not.toContain('PRIVATE_NATIVE_ERROR');
    h.queue.stop();
  });
});
