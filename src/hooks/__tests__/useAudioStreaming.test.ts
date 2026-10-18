import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hookHarness, settleHook } from './hookHarness';

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  ...await import('./hookHarness').then(({ hookHarness: hooks }) => ({
    useState: hooks.useState, useRef: hooks.useRef, useCallback: hooks.useCallback,
    useMemo: hooks.useMemo, useEffect: hooks.useEffect, useReducer: hooks.useReducer,
  })),
}));

const gemini = vi.hoisted(() => ({ connect: vi.fn(), apiKeys: [] as string[], configurations: [] as any[], sends: [] as ReturnType<typeof vi.fn>[], toolSends: [] as ReturnType<typeof vi.fn>[], closes: [] as ReturnType<typeof vi.fn>[] }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor(options: { apiKey: string }) { gemini.apiKeys.push(options.apiKey); }
    live = { connect: gemini.connect };
  },
  Modality: { AUDIO: 'AUDIO' },
  StartSensitivity: { START_SENSITIVITY_HIGH: 'high' },
  FunctionResponseScheduling: { SILENT: 'SILENT' },
}));

import { useAudioStreaming } from '../useAudioStreaming';
import { VoiceControl } from '../../components/voice/VoiceControl';

const addWorkletModule = vi.fn(async () => {});
type SyntheticAudioBuffer = {
  duration: number;
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  getChannelData: (channel: number) => Float32Array;
  copyToChannel: (samples: Float32Array, channel: number, offset?: number) => void;
};
let scheduledSources: SyntheticAudioSource[];
let deferAudioDecoding: boolean;
let pendingAudioDecodes: Array<() => void>;
class SyntheticAudioSource {
  buffer: SyntheticAudioBuffer | null = null;
  onended: (() => void) | null = null;
  startedAt = 0;
  stopped = false;
  constructor(readonly context: SyntheticAudioContext) {}
  connect() {}
  disconnect() {}
  stop() { this.stopped = true; }
  start(time = 0) {
    this.startedAt = time;
    scheduledSources.push(this);
  }
}
class SyntheticAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  audioWorklet = { addModule: () => addWorkletModule() };
  readonly sampleRate: number;
  constructor(options: { sampleRate?: number } = {}) { this.sampleRate = options.sampleRate ?? 48000; }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createMediaStreamSource() { return { connect: () => {} }; }
  createMediaStreamDestination() { return { stream: {} }; }
  createAnalyser() { return { context: this, connect: () => {}, disconnect: () => {} }; }
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): SyntheticAudioBuffer {
    const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    return {
      duration: length / sampleRate, length, numberOfChannels, sampleRate,
      getChannelData: (channel) => channels[channel],
      copyToChannel: (samples, channel, offset = 0) => { channels[channel].set(samples, offset); },
    };
  }
  createBufferSource() { return new SyntheticAudioSource(this); }
  decodeAudioData(data: ArrayBuffer): Promise<SyntheticAudioBuffer> {
    const wav = new DataView(data);
    if (wav.getUint32(0, false) !== 0x52494646) throw new Error('Expected synthetic PCM WAV data');
    const buffer = this.createBuffer(1, wav.getUint32(40, true) / 2, wav.getUint32(24, true));
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = wav.getInt16(44 + index * 2, true) / 32768;
    if (!deferAudioDecoding) return Promise.resolve(buffer);
    return new Promise((resolve) => { pendingAudioDecodes.push(() => resolve(buffer)); });
  }
}

let stopTrack: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;
let processors: Array<{ context: SyntheticAudioContext; port: { onmessage?: (event: { data: { type: string; data: Float32Array } }) => void } }>;
const audioFrame = (index: number, amplitude: number) => processors[index].port.onmessage?.({
  data: { type: 'audioData', data: new Float32Array(16000).fill(amplitude) },
});
const renderAudio = () => hookHarness.render(() => useAudioStreaming());
const denial = (status: number, malformed = false) => new Response(
  malformed ? '<private>server stack and secret</private>' : JSON.stringify({ error: 'private server credential', details: 'secret' }),
  { status, headers: { 'content-type': malformed ? 'text/html' : 'application/json' } },
);

beforeEach(() => {
  hookHarness.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  stopTrack = vi.fn();
  getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia }, userAgent: 'SyntheticBrowser' });
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { search: '' } }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('AudioContext', SyntheticAudioContext);
  vi.stubGlobal('MediaRecorder', undefined);
  scheduledSources = [];
  deferAudioDecoding = false;
  pendingAudioDecodes = [];
  processors = [];
  addWorkletModule.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('AudioWorkletNode', class { port = {}; constructor(readonly context: SyntheticAudioContext) { processors.push(this); } disconnect() {} connect() {} });
  vi.stubGlobal('fetch', vi.fn());
  gemini.configurations = [];
  gemini.apiKeys = [];
  gemini.sends = [];
  gemini.toolSends = [];
  gemini.closes = [];
  gemini.connect.mockImplementation(async (configuration) => {
    gemini.configurations.push(configuration);
    configuration.callbacks.onopen();
    const sendRealtimeInput = vi.fn();
    const sendToolResponse = vi.fn();
    gemini.sends.push(sendRealtimeInput);
    gemini.toolSends.push(sendToolResponse);
    const close = vi.fn(() => {
      configuration.callbacks.onerror({ message: 'socket closed during cleanup' });
      configuration.callbacks.onclose({ code: 1006, reason: 'cleanup' });
    });
    gemini.closes.push(close);
    return { sendRealtimeInput, sendToolResponse, close };
  });
});

describe('visual status with prepaid live connections', () => {
  const visualMessages = () => gemini.sends[0].mock.calls
    .map(([payload]) => payload.text as string | undefined)
    .filter((text): text is string => !!text?.startsWith('VISUAL_STATUS '));

  async function startConnected() {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-token' }));
    await renderAudio().startStreaming();
    renderAudio();
    return gemini.configurations[0].callbacks;
  }

  it('answers pending immediately and waits for both the tutor turn and queued playback before reporting ready', async () => {
    const callbacks = await startConnected();
    let finishVisual!: (report: { status: 'ready'; explanation: string }) => void;
    const listener = vi.fn(() => new Promise<{ status: 'ready'; explanation: string }>(resolve => { finishVisual = resolve; }));
    renderAudio().setToolCallListener(listener);
    callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'visual-1', name: 'generate_visualization_description', args: {} }] } });
    expect(listener).toHaveBeenCalledWith('generate_visualization_description', {}, 'visual-1');
    expect(gemini.toolSends[0]).toHaveBeenCalledExactlyOnceWith({ functionResponses: [{
      id: 'visual-1', name: 'generate_visualization_description',
      response: { result: expect.stringContaining('NOT on screen yet'), scheduling: 'SILENT' },
    }] });
    finishVisual({ status: 'ready', explanation: 'A fraction circle' });
    await settleHook();
    await vi.advanceTimersByTimeAsync(1000);
    expect(visualMessages()).toEqual([]);

    const data = Buffer.alloc(4800).toString('base64');
    callbacks.onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data } }] } } });
    callbacks.onmessage({ serverContent: { turnComplete: true } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(scheduledSources).toHaveLength(1);
    expect(visualMessages()).toEqual([]);
    scheduledSources[0].onended?.();
    await vi.advanceTimersByTimeAsync(250);
    expect(visualMessages()).toEqual(['VISUAL_STATUS {"status":"ready","onScreen":"A fraction circle"}']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(visualMessages()).toHaveLength(1);
  });

  it('reports a rejected visual handler as failed after the tutor finishes its turn', async () => {
    const callbacks = await startConnected();
    renderAudio().setToolCallListener(() => Promise.reject(new Error('Renderer failed')));
    callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'visual-failure', name: 'request_learning_artifact', args: {} }] } });
    await settleHook();
    callbacks.onmessage({ serverContent: { turnComplete: true } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(visualMessages()).toEqual(['VISUAL_STATUS {"status":"failed","reason":"Renderer failed"}']);
  });

  it('keeps nonvisual tool responses immediate without queuing a visual report', async () => {
    const callbacks = await startConnected();
    renderAudio().setToolCallListener(() => Promise.resolve({ status: 'ready', explanation: 'Ignored' }));
    callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'topic-1', name: 'set_topic', args: {} }] } });
    await settleHook();
    callbacks.onmessage({ serverContent: { turnComplete: true } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(gemini.toolSends[0]).toHaveBeenCalledExactlyOnceWith({ functionResponses: [{
      id: 'topic-1', name: 'set_topic', response: { result: 'Tool is being called', scheduling: 'SILENT' },
    }] });
    expect(visualMessages()).toEqual([]);
  });
});


describe('incoming model audio playback', () => {
  const pcmPart = (value: number, sampleCount = 2400) => {
    const pcm = Buffer.alloc(sampleCount * 2);
    for (let index = 0; index < sampleCount; index++) pcm.writeInt16LE(value, index * 2);
    return { inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm.toString('base64') } };
  };
  const scheduledSamples = () => scheduledSources.flatMap((source) => Array.from(source.buffer!.getChannelData(0)));
  async function startConnected() {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-token' }));
    await renderAudio().startStreaming();
    return gemini.configurations.at(-1)!.callbacks;
  }
  function sendParts(callbacks: { onmessage: (message: unknown) => void }, part: ReturnType<typeof pcmPart>, count = 10) {
    for (let index = 0; index < count; index++) callbacks.onmessage({ serverContent: { modelTurn: { parts: [part] } } });
  }

  it('reports fixed outbound timing metadata without changing sends or provider interruption handling', async () => {
    const diagnostics: Array<Record<string, unknown>> = [];
    window.addEventListener('insyte-live-input', event => diagnostics.push((event as CustomEvent<Record<string, unknown>>).detail));
    const callbacks = await startConnected();
    renderAudio().sendText('PRIVATE_USER_TEXT');
    renderAudio().sendViewport(640, 480, 2);
    renderAudio().sendMedia('PRIVATE_IMAGE_DATA', 'image/png');
    audioFrame(0, 0.25);
    audioFrame(0, 0.25);
    callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'PRIVATE_CALL_ID', name: 'PRIVATE_TOOL_NAME', args: { privateArgument: 'PRIVATE_TOOL_TEXT' } }] } });
    const sends = gemini.sends[0].mock.calls.map(([payload]) => payload);
    expect(sends.slice(0, 4)).toEqual([
      { text: 'Hello' },
      { text: 'PRIVATE_USER_TEXT' },
      { text: 'VISUAL_VIEWPORT {"width":640,"height":480,"devicePixelRatio":2}' },
      { video: { data: 'PRIVATE_IMAGE_DATA', mimeType: 'image/png' } },
    ]);
    expect(sends[4]).toEqual({ audio: { data: expect.any(String), mimeType: 'audio/pcm;rate=16000' } });
    expect(Buffer.from(sends[4].audio.data, 'base64').byteLength).toBe(64000);
    expect(gemini.toolSends[0]).toHaveBeenCalledExactlyOnceWith({ functionResponses: [{
      id: 'PRIVATE_CALL_ID', name: 'PRIVATE_TOOL_NAME',
      response: { result: 'Tool is being called', scheduling: 'SILENT' },
    }] });
    expect(diagnostics.map(({ event, kind, source }) => ({ event, kind, source }))).toEqual([
      { event: 'sent', kind: 'text', source: 'initial' },
      { event: 'sent', kind: 'text', source: 'user' },
      { event: 'sent', kind: 'text', source: 'viewport' },
      { event: 'sent', kind: 'video', source: 'visual' },
      { event: 'sent', kind: 'audio', source: 'microphone' },
      { event: 'sent', kind: 'tool', source: 'tool' },
    ]);
    expect(diagnostics[4].audioBytes).toBe(64000);
    sendParts(callbacks, pcmPart(16384), 1);
    expect(renderAudio().isSpeaking).toBe(true);
    callbacks.onmessage({ serverContent: { interrupted: true } });
    expect(scheduledSources.every(source => source.stopped)).toBe(true);
    expect(renderAudio().isSpeaking).toBe(false);
    expect(renderAudio().connectionStatus).toBe('connected');
    expect(diagnostics.at(-1)).toEqual({ event: 'server-interrupted', timestampMs: Date.now(), connectionGeneration: 1 });
    expect(diagnostics.every(detail => detail.timestampMs === Date.now() && detail.connectionGeneration === 1)).toBe(true);
    expect(JSON.stringify(diagnostics)).not.toContain('PRIVATE_');
  });

  it('does not report a failed outbound send', async () => {
    const diagnostics: unknown[] = [];
    window.addEventListener('insyte-live-input', event => diagnostics.push((event as CustomEvent).detail));
    await startConnected();
    expect(diagnostics).toHaveLength(1);
    gemini.sends[0].mockImplementationOnce(() => { throw new Error('PRIVATE_TRANSPORT_ERROR'); });
    renderAudio().sendText('PRIVATE_FAILED_TEXT');
    expect(diagnostics).toHaveLength(1);
  });

  it('keeps timing events tied to the replacement connection and ignores stale input callbacks', async () => {
    const diagnostics: Array<Record<string, unknown>> = [];
    window.addEventListener('insyte-live-input', event => diagnostics.push((event as CustomEvent<Record<string, unknown>>).detail));
    const previous = await startConnected();
    renderAudio().stopStreaming();
    const current = await startConnected();
    expect(diagnostics.map(detail => detail.connectionGeneration)).toEqual([1, 2]);
    const previousCount = diagnostics.length;
    previous.onmessage({ serverContent: { interrupted: true } });
    audioFrame(0, 0.5);
    audioFrame(0, 0.5);
    expect(diagnostics).toHaveLength(previousCount);
    renderAudio().sendViewport(640, 480, 2);
    current.onmessage({ serverContent: { interrupted: true } });
    expect(diagnostics.slice(previousCount).map(detail => detail.connectionGeneration)).toEqual([2, 2]);
    expect(renderAudio().connectionStatus).toBe('connected');
  });

  it('plays every audio part after a text part and flushes a short completed turn', async () => {
    const observed: number[] = [];
    renderAudio().setOnAiAudioDataListener((samples) => observed.push(...samples));
    const callbacks = await startConnected();
    callbacks.onmessage({ serverContent: {
      modelTurn: { parts: [{ text: 'Synthetic marker' }, pcmPart(16384, 240), pcmPart(-16384, 240)] },
      turnComplete: true,
    } });
    await settleHook();
    const expected = [...Array<number>(240).fill(0.5), ...Array<number>(240).fill(-0.5)];
    expect(observed).toHaveLength(480);
    expect(observed).toEqual(expected);
    expect(scheduledSamples()).toEqual(expected);
  });

  it('preserves incoming sample order when asynchronous WAV decodes finish in reverse order', async () => {
    deferAudioDecoding = true;
    const callbacks = await startConnected();
    sendParts(callbacks, pcmPart(16384));
    sendParts(callbacks, pcmPart(-16384));
    pendingAudioDecodes.splice(0).reverse().forEach((finish) => finish());
    await settleHook();
    const samples = scheduledSamples();
    expect(samples).toHaveLength(48000);
    expect(samples.slice(0, 24000).every((sample) => sample === 0.5)).toBe(true);
    expect(samples.slice(24000).every((sample) => sample === -0.5)).toBe(true);
  });

  it('schedules incoming audio at the queued tail without adding a gap while playback remains buffered', async () => {
    const callbacks = await startConnected();
    sendParts(callbacks, pcmPart(16384));
    await settleHook();
    expect(scheduledSources.length).toBeGreaterThan(0);
    const tail = Math.max(...scheduledSources.map((source) => source.startedAt + source.buffer!.duration));
    const previousCount = scheduledSources.length;
    scheduledSources[0].context.currentTime = tail - 0.02;
    sendParts(callbacks, pcmPart(-16384));
    await settleHook();
    expect(scheduledSources.length).toBeGreaterThan(previousCount);
    expect(scheduledSources[previousCount].startedAt).toBeCloseTo(tail, 8);
  });

  it('ignores old provider audio delivered on a deferred animation frame after stop and restart', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    const observed: number[] = [];
    renderAudio().setOnAiAudioDataListener((samples) => observed.push(...samples));
    const previous = await startConnected();
    sendParts(previous, pcmPart(16384));
    await settleHook();
    expect(scheduledSources.length).toBeGreaterThan(0);
    requestAnimationFrame(() => sendParts(previous, pcmPart(16384)));
    renderAudio().stopStreaming();
    const current = await startConnected();
    observed.length = 0;
    sendParts(current, pcmPart(-16384));
    await settleHook();
    const currentSourceCount = scheduledSources.length;
    frames.splice(0).forEach((frame) => frame(0));
    await settleHook();
    expect(scheduledSources).toHaveLength(currentSourceCount);
    expect(observed).toHaveLength(24000);
    expect(observed.every((sample) => sample === -0.5)).toBe(true);
    expect(scheduledSources.at(-1)!.context.state).toBe('running');
    expect(renderAudio().connectionStatus).toBe('connected');
  });

  it('keeps delayed AI recorder finalization separate from the replacement recorder', async () => {
    const recorders: DeferredRecorder[] = [];
    class DeferredRecorder {
      static isTypeSupported() { return true; }
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable?: (event: BlobEvent) => void;
      listeners = new Set<() => void>();
      stop = vi.fn(() => { this.state = 'inactive'; });
      constructor() { recorders.push(this); }
      start() { this.state = 'recording'; }
      addEventListener(_event: string, listener: () => void) { this.listeners.add(listener); }
      removeEventListener(_event: string, listener: () => void) { this.listeners.delete(listener); }
      finishStop() { this.listeners.forEach((listener) => listener()); }
      emit(text: string) { this.ondataavailable?.({ data: new Blob([text]) } as BlobEvent); }
    }
    vi.stubGlobal('MediaRecorder', DeferredRecorder);
    const recordings: Array<{ ai: Blob | null }> = [];
    renderAudio().setOnRecordingsReady((payload) => recordings.push(payload));
    const previous = await startConnected();
    sendParts(previous, pcmPart(16384));
    await settleHook();
    expect(recorders).toHaveLength(2);
    recorders[1].emit('old AI');
    renderAudio().stopStreaming();
    const current = await startConnected();
    sendParts(current, pcmPart(-16384));
    await settleHook();
    expect(recorders).toHaveLength(4);
    recorders[1].emit(' final');
    recorders[0].finishStop();
    recorders[1].finishStop();
    await settleHook();
    sendParts(current, pcmPart(-16384));
    await settleHook();
    expect(recorders).toHaveLength(4);
    recorders[3].emit('new AI');
    renderAudio().stopStreaming();
    expect(recorders[3].stop).toHaveBeenCalledOnce();
    recorders[2].finishStop();
    recorders[3].finishStop();
    await settleHook();
    expect(await Promise.all(recordings.map(async (recording) => recording.ai?.text()))).toEqual(['old AI final', 'new AI']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uploads final stop data for both recorders without sending old chunks to a replacement session', async () => {
    const sessionA = '00000000-0000-4000-8000-000000000101';
    const sessionB = '00000000-0000-4000-8000-000000000102';
    const recorders: StopDataRecorder[] = [];
    class StopDataRecorder {
      static isTypeSupported() { return true; }
      state = 'inactive';
      mimeType = 'audio/webm';
      finalText = '';
      ondataavailable?: (event: BlobEvent) => void;
      listeners = new Set<() => void>();
      constructor() { recorders.push(this); }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        void Promise.resolve().then(() => {
          this.emit(this.finalText);
          this.listeners.forEach((listener) => listener());
        });
      }
      addEventListener(_event: string, listener: () => void) { this.listeners.add(listener); }
      removeEventListener(_event: string, listener: () => void) { this.listeners.delete(listener); }
      emit(text: string) { this.ondataavailable?.({ data: new Blob([text]) } as BlobEvent); }
    }
    vi.stubGlobal('MediaRecorder', StopDataRecorder);
    const uploads: Array<{ form: FormData; part: Blob }> = [];
    const finalizations: Array<{ id: string; parts: number }> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'https://synthetic.invalid');
      if (url.pathname === '/api/genai/ephemeral') return Response.json({ token: 'synthetic-token' });
      const match = url.pathname.match(/^\/api\/learning\/sessions\/([^/]+)\/recordings\/(parts|finalize)$/);
      if (!match || init?.method !== 'POST') throw new Error('Unexpected synthetic recording request');
      if (match[2] === 'parts') {
        const form = init.body;
        if (!(form instanceof FormData)) throw new Error('Expected recording FormData');
        const part = form.get('part');
        if (!(part instanceof Blob)) throw new Error('Expected recording part Blob');
        expect(form.get('id')).toBe(match[1]);
        expect(form.get('type')).toBe(url.searchParams.get('type'));
        uploads.push({ form, part });
      } else {
        finalizations.push({ id: match[1], parts: uploads.filter(({ form }) => form.get('id') === match[1]).length });
      }
      return Response.json({ ok: true });
    });
    const uploadedParts = async (id: string) => Promise.all(uploads
      .filter(({ form }) => form.get('id') === id)
      .sort((left, right) => String(left.form.get('type')).localeCompare(String(right.form.get('type'))))
      .map(async ({ form, part }) => ({ id: form.get('id'), type: form.get('type'), text: await part.text() })));
    try {
      renderAudio().setSessionId(sessionA);
      const previous = await startConnected();
      sendParts(previous, pcmPart(16384));
      await settleHook();
      expect(recorders).toHaveLength(2);
      recorders[0].finalText = 'A final user';
      recorders[1].finalText = 'A final AI';
      renderAudio().stopStreaming();
      await vi.advanceTimersByTimeAsync(100);
      expect(await uploadedParts(sessionA)).toEqual([
        { id: sessionA, type: 'ai', text: 'A final AI' },
        { id: sessionA, type: 'user', text: 'A final user' },
      ]);
      expect(finalizations).toEqual([{ id: sessionA, parts: 2 }]);
      renderAudio().setSessionId(sessionB);
      const current = await startConnected();
      sendParts(current, pcmPart(-16384));
      await settleHook();
      expect(recorders).toHaveLength(4);
      recorders[2].finalText = 'B final user';
      recorders[3].finalText = 'B final AI';
      recorders[0].emit('stale A user');
      recorders[1].emit('stale A AI');
      renderAudio().stopStreaming();
      await vi.advanceTimersByTimeAsync(100);
      expect(await uploadedParts(sessionB)).toEqual([
        { id: sessionB, type: 'ai', text: 'B final AI' },
        { id: sessionB, type: 'user', text: 'B final user' },
      ]);
      expect(uploads).toHaveLength(4);
      expect(finalizations).toEqual([{ id: sessionA, parts: 2 }, { id: sessionB, parts: 2 }]);
    } finally {
      renderAudio().setSessionId(null);
      renderAudio().stopStreaming();
      await settleHook();
    }
  });

  it('stops playback and capture when automatic reconnect recovery is exhausted', async () => {
    vi.mocked(fetch).mockImplementation(async () => Response.json({ token: 'synthetic-recovery-token' }));
    let callbacks = await startConnected();
    sendParts(callbacks, pcmPart(16384));
    await settleHook();
    const playbackSources = scheduledSources.slice();
    expect(playbackSources.length).toBeGreaterThan(0);
    callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'synthetic-handle' } });
    callbacks.onclose({ code: 1006, reason: 'synthetic rapid drop' });
    for (const delay of [1000, 2000, 4000]) {
      await vi.advanceTimersByTimeAsync(delay);
      callbacks = gemini.configurations.at(-1)!.callbacks;
      callbacks.onclose({ code: 1006, reason: 'synthetic rapid drop' });
    }
    const audio = renderAudio();
    expect(audio.error).toContain('connection kept dropping');
    expect(audio.isStreaming).toBe(false);
    expect(audio.isSpeaking).toBe(false);
    expect(audio.connectionStatus).toBe('disconnected');
    expect(playbackSources.every((source) => source.stopped && source.context.state === 'closed')).toBe(true);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(gemini.configurations).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(gemini.configurations).toHaveLength(4);
  });
});

afterEach(() => {
  hookHarness.unmount();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('voice token startup failures', () => {
  it.each([[401, false], [403, true], [429, true], [503, true]] as const)('retains HTTP %s with a safe message through capture cleanup', async (status, malformed) => {
    vi.mocked(fetch).mockResolvedValueOnce(denial(status, malformed));
    await renderAudio().startStreaming().catch(() => {});
    const audio = renderAudio();
    expect(audio.error).toContain(`HTTP ${status}`);
    expect(audio.error).not.toMatch(/private|secret|server stack/);
    expect(audio.isStreaming).toBe(false);
    expect(audio.connectionStatus).toBe('disconnected');
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(gemini.configurations).toHaveLength(0);
  });

  it('rejects the startup promise after storing its safe error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(denial(401));
    await expect(renderAudio().startStreaming()).rejects.toThrow('HTTP 401');
    expect(renderAudio().error).toContain('HTTP 401');
  });

  it('retains the token response status on the rejected startup error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(denial(401));
    await expect(renderAudio().startStreaming()).rejects.toMatchObject({ status: 401 });
  });

  it('allows only one concurrent microphone and token request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-token' }));
    const audio = renderAudio();
    await Promise.all([audio.startStreaming(), audio.startStreaming()]);
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('stops microphone tracks acquired after a manual cancellation without requesting a token', async () => {
    let finishMicrophone!: (stream: unknown) => void;
    getUserMedia.mockImplementationOnce(() => new Promise((resolve) => { finishMicrophone = resolve; }));
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-token' }));
    const starting = renderAudio().startStreaming();
    renderAudio().stopStreaming();
    finishMicrophone({ getTracks: () => [{ stop: stopTrack }] });
    await starting;
    expect(fetch).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(renderAudio().connectionStatus).toBe('disconnected');
  });

  it('closes a socket that finishes connecting after manual cancellation', async () => {
    let finishConnect!: (session: unknown) => void;
    const close = vi.fn();
    gemini.connect.mockImplementationOnce((configuration) => {
      gemini.configurations.push(configuration);
      return new Promise((resolve) => { finishConnect = resolve; });
    });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-token' }));
    const starting = renderAudio().startStreaming();
    await settleHook();
    renderAudio().stopStreaming();
    gemini.configurations[0].callbacks.onopen();
    finishConnect({ close, sendRealtimeInput: () => {} });
    await starting;
    expect(close).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(renderAudio().connectionStatus).toBe('disconnected');
  });
});

describe('one startup per user activation', () => {
  it('does not restart a failed active session on rerender or callback changes', async () => {
    vi.mocked(fetch).mockResolvedValue(denial(401));
    const errors: string[] = [];
    const render = (active: boolean, onError = (error: string) => { errors.push(error); }) =>
      hookHarness.render(() => VoiceControl({ active, onError }));
    render(false);
    render(true);
    render(true);
    await settleHook();
    render(true);
    await settleHook();
    render(true, (error) => { errors.push(error); });
    await settleHook();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(errors.at(-1)).toContain('HTTP 401');
    expect(errors.join(' ')).not.toContain('Retrying too quickly');
    render(false);
    render(true);
    await settleHook();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('signals a failed startup to the parent so another click can reactivate', async () => {
    vi.mocked(fetch).mockResolvedValue(denial(403));
    let active = true;
    const props = { active, onStartupFailed: () => { active = false; } };
    hookHarness.render(() => VoiceControl(props));
    await settleHook();
    expect(active).toBe(false);
  });

  it('allows an explicit activation after a terminal resume failure without treating the old error as a new failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-token' }));
    let active = true;
    const render = () => hookHarness.render(() => VoiceControl({ active, onStartupFailed: () => { active = false; } }));
    render();
    await settleHook();
    render();
    const configuration = gemini.configurations[0];
    configuration.callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'synthetic-handle' } });
    configuration.callbacks.onclose({ code: 1006, reason: 'temporary drop' });
    vi.mocked(fetch).mockResolvedValueOnce(denial(403));
    await vi.advanceTimersByTimeAsync(1000);
    render();
    expect(active).toBe(false);
    render();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-retry-token' }));
    active = true;
    render();
    await settleHook();
    render();
    expect(active).toBe(true);
    expect(gemini.configurations).toHaveLength(2);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('does not deactivate a new activation when the old microphone request rejects late', async () => {
    let rejectMicrophone!: (error: Error) => void;
    getUserMedia.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectMicrophone = reject; }));
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-new-token' }));
    let active = true;
    const errors: string[] = [];
    const render = () => hookHarness.render(() => VoiceControl({
      active, onStartupFailed: () => { active = false; }, onError: (error) => errors.push(error),
    }));
    render();
    active = false;
    render();
    active = true;
    render();
    await settleHook();
    rejectMicrophone(new Error('Old activation failed'));
    await settleHook();
    render();
    expect(active).toBe(true);
    expect(errors).toEqual([]);
  });

  it('deactivates a terminal startup close while the worklet is still loading', async () => {
    let finishWorklet!: () => void;
    addWorkletModule.mockImplementationOnce(() => new Promise((resolve) => { finishWorklet = resolve; }));
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-token' }));
    let active = true;
    const render = () => hookHarness.render(() => VoiceControl({ active, onStartupFailed: () => { active = false; } }));
    render();
    await settleHook();
    render();
    gemini.configurations[0].callbacks.onclose({ code: 1006, reason: 'closed before setup' });
    render();
    expect(active).toBe(false);
    finishWorklet();
    await settleHook();
    expect(active).toBe(false);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('reports a terminal error once before deactivating after startup resolves', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-token' }));
    let active = true;
    const events: string[] = [];
    const onError = (error: string) => events.push(`error:${error}`);
    const onStartupFailed = () => { events.push('failed'); active = false; };
    const render = () => hookHarness.render(() => VoiceControl({ active, onError, onStartupFailed }));
    render();
    await settleHook();
    render();
    gemini.configurations[0].callbacks.onclose({ code: 1006, reason: 'terminal close' });
    render();
    expect(events).toEqual(['error:Live voice connection ended. Please try again.', 'failed']);
    expect(active).toBe(false);
    render();
    expect(events).toHaveLength(2);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('socket resumption', () => {
  async function startConnected() {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-token' }));
    await renderAudio().startStreaming();
    const configuration = gemini.configurations[0];
    configuration.callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'synthetic-handle' } });
    configuration.callbacks.onclose({ code: 1006, reason: 'temporary drop' });
    return configuration;
  }

  it('handles a denied resume token without leaking a promise or retrying authorization', async () => {
    const configuration = await startConnected();
    vi.mocked(fetch).mockResolvedValueOnce(denial(403, true));
    await vi.advanceTimersByTimeAsync(1000);
    let audio = renderAudio();
    expect(audio.error).toContain('HTTP 403');
    expect(audio.isStreaming).toBe(false);
    expect(audio.connectionStatus).toBe('disconnected');
    expect(stopTrack).toHaveBeenCalledOnce();
    configuration.callbacks.onerror({ message: 'late socket cleanup error' });
    configuration.callbacks.onclose({ code: 1006, reason: 'late socket close' });
    await vi.advanceTimersByTimeAsync(60000);
    audio = renderAudio();
    expect(audio.error).toContain('HTTP 403');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps bounded automatic recovery for a transient socket drop', async () => {
    await startConnected();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-resume-token' }));
    await vi.advanceTimersByTimeAsync(1000);
    const audio = renderAudio();
    expect(audio.connectionStatus).toBe('connected');
    expect(audio.isStreaming).toBe(true);
    expect(audio.error).toBe('');
    expect(gemini.configurations).toHaveLength(2);
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  it('ignores a previous resume token denial after the user starts a new session', async () => {
    await startConnected();
    let finishResume!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finishResume = resolve; }));
    await vi.advanceTimersByTimeAsync(1000);
    renderAudio().stopStreaming();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-new-token' }));
    await renderAudio().startStreaming();
    finishResume(denial(403));
    await settleHook();
    const audio = renderAudio();
    expect(audio.isStreaming).toBe(true);
    expect(audio.connectionStatus).toBe('connected');
    expect(audio.error).toBe('');
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('ignores callbacks from a manually stopped socket after a new session starts', async () => {
    const previous = await startConnected();
    renderAudio().stopStreaming();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-new-token' }));
    await renderAudio().startStreaming();
    previous.callbacks.onerror({ message: 'old socket failure' });
    previous.callbacks.onopen();
    previous.callbacks.onclose({ code: 1006, reason: 'old socket close' });
    await vi.advanceTimersByTimeAsync(60000);
    const audio = renderAudio();
    expect(audio.error).toBe('');
    expect(audio.connectionStatus).toBe('connected');
    expect(audio.isStreaming).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('ignores events from the replaced socket after automatic resumption', async () => {
    const previous = await startConnected();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-resume-token' }));
    await vi.advanceTimersByTimeAsync(1000);
    previous.callbacks.onerror({ message: 'replaced socket failure' });
    previous.callbacks.onclose({ code: 1006, reason: 'replaced socket close' });
    await vi.advanceTimersByTimeAsync(10000);
    const audio = renderAudio();
    expect(audio.error).toBe('');
    expect(audio.connectionStatus).toBe('connected');
    audio.sendText('Still connected');
    expect(renderAudio().error).toBe('');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not send queued audio from an old worklet into the new session', async () => {
    await startConnected();
    renderAudio().stopStreaming();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-new-token' }));
    await renderAudio().startStreaming();
    audioFrame(0, 0.1);
    audioFrame(0, 0.1);
    expect(gemini.sends[1]).toHaveBeenCalledOnce();
  });

  it('keeps delayed recorder finalization separate from the next active recording', async () => {
    const recorders: DeferredRecorder[] = [];
    class DeferredRecorder {
      static isTypeSupported() { return true; }
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable?: (event: BlobEvent) => void;
      listeners = new Set<() => void>();
      stop = vi.fn(() => { this.state = 'inactive'; });
      constructor() { recorders.push(this); }
      start() { this.state = 'recording'; }
      addEventListener(_event: string, listener: () => void) { this.listeners.add(listener); }
      removeEventListener(_event: string, listener: () => void) { this.listeners.delete(listener); }
      finishStop() { this.listeners.forEach((listener) => listener()); }
    }
    vi.stubGlobal('MediaRecorder', DeferredRecorder);
    const recordings: Array<{ user: Blob | null }> = [];
    renderAudio().setOnRecordingsReady((payload) => recordings.push(payload));
    renderAudio().setSaveOnlySpeech?.(true);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-token' }));
    await renderAudio().startStreaming();
    audioFrame(0, 0.1);
    recorders[0].ondataavailable?.({ data: new Blob(['old recording']) } as BlobEvent);
    renderAudio().stopStreaming();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: 'synthetic-new-token' }));
    await renderAudio().startStreaming();
    audioFrame(1, 0.1);
    audioFrame(1, 0);
    recorders[0].ondataavailable?.({ data: new Blob([' old final']) } as BlobEvent);
    recorders[1].ondataavailable?.({ data: new Blob(['new recording']) } as BlobEvent);
    recorders[0].finishStop();
    await settleHook();
    renderAudio().stopStreaming();
    expect(recorders[1].stop).toHaveBeenCalledOnce();
    recorders[1].finishStop();
    await settleHook();
    expect(await recordings[0].user!.text()).toBe('old recording old final');
    expect(recordings[1].user).not.toBeNull();
    expect(await recordings[1].user!.text()).toBe('new recording');
  });
});

describe('server-locked voice tokens', () => {
  const grantId = '00000000-0000-4000-8000-0000000000aa';
  const tokenResponse = (token: string, minutesFromNow: number, remainingCredits: number) => Response.json({
    token,
    model: 'models/server-live-model',
    config: { systemInstruction: 'SERVER PROMPT', tools: [{ functionDeclarations: [] }] },
    expireTime: new Date(Date.now() + minutesFromNow * 60_000).toISOString(),
    newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
    billing: { grantId, minutesCharged: 5, remainingCredits },
  });
  const requestBody = (call: number) => JSON.parse(String(vi.mocked(fetch).mock.calls[call][1]!.body));

  it('connects with the config the server locked into the token and renews the paid block before it expires', async () => {
    const credits: unknown[] = [];
    renderAudio().setOnCreditsUpdate((update) => credits.push(update));
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('first-token', 5, 10))
      .mockResolvedValueOnce(tokenResponse('second-token', 9, 5));

    await renderAudio().startStreaming();

    expect(gemini.configurations).toHaveLength(1);
    expect(gemini.configurations[0].model).toBe('models/server-live-model');
    expect(gemini.configurations[0].config).toEqual({ systemInstruction: 'SERVER PROMPT', tools: [{ functionDeclarations: [] }] });
    expect(requestBody(0)).toMatchObject({ grantId: null, variant: 'tutor', resumptionHandle: null });
    expect(credits).toEqual([{ remainingCredits: 10, minutesCharged: 5 }]);

    gemini.configurations[0].callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'handle-1' } });
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000 + 1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requestBody(1)).toMatchObject({ grantId, resumptionHandle: 'handle-1' });
    expect(gemini.configurations).toHaveLength(2);
    expect(credits).toEqual([
      { remainingCredits: 10, minutesCharged: 5 },
      { remainingCredits: 5, minutesCharged: 5 },
    ]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(renderAudio().isStreaming).toBe(true);
    renderAudio().stopStreaming();
  });

  it.each([402, 403])('preserves paid input and callbacks until expiry when renewal returns HTTP %s', async (status) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('first-token', 2, 0))
      .mockResolvedValueOnce(denial(status));

    await renderAudio().startStreaming();
    const callbacks = gemini.configurations[0].callbacks;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(renderAudio().isStreaming).toBe(true);
    expect(renderAudio().connectionStatus).toBe('connected');
    expect(renderAudio().error).toBe('');
    expect(stopTrack).not.toHaveBeenCalled();
    audioFrame(0, 0.25);
    audioFrame(0, 0.25);
    expect(gemini.sends[0].mock.calls.at(-1)![0]).toHaveProperty('audio');
    callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'paid-turn', name: 'paid-tool', args: {} }] } });
    expect(gemini.toolSends[0]).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(renderAudio().isStreaming).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(renderAudio().isStreaming).toBe(false);
    expect(renderAudio().error).toContain(`HTTP ${status}`);
    expect(stopTrack).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('ends the paid block at expiry when renewal is still pending and ignores its late token', async () => {
    let finishRenewal!: (response: Response) => void;
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('first-token', 2, 0))
      .mockImplementationOnce(() => new Promise(resolve => { finishRenewal = resolve; }));
    await renderAudio().startStreaming();
    await vi.advanceTimersByTimeAsync(60_000);
    audioFrame(0, 0.25);
    audioFrame(0, 0.25);
    expect(gemini.sends[0].mock.calls.at(-1)![0]).toHaveProperty('audio');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(renderAudio().isStreaming).toBe(false);
    expect(stopTrack).toHaveBeenCalledOnce();
    finishRenewal(tokenResponse('late-token', 5, 0));
    await settleHook();
    expect(gemini.configurations).toHaveLength(1);
    expect(renderAudio().isStreaming).toBe(false);
  });

  it('cancels the paid-expiry deadline when the user stops during renewal', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('first-token', 2, 0))
      .mockResolvedValueOnce(denial(402));
    await renderAudio().startStreaming();
    await vi.advanceTimersByTimeAsync(60_000);
    renderAudio().stopStreaming();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(renderAudio().error).toBe('');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('resumes the same paid token with its latest handle without minting another credential', async () => {
    const credits: unknown[] = [];
    renderAudio().setOnCreditsUpdate(update => credits.push(update));
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('paid-token', 5, 0))
      .mockResolvedValueOnce(tokenResponse('independent-token', 5, 0));
    await renderAudio().startStreaming();
    const previous = gemini.configurations[0];
    previous.callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'paid-handle' } });
    previous.callbacks.onclose({ code: 1006, reason: 'temporary drop' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledOnce();
    expect(gemini.apiKeys).toEqual(['paid-token', 'paid-token']);
    expect(gemini.configurations[1].config).toEqual({ ...previous.config, sessionResumption: { handle: 'paid-handle' } });
    expect(credits).toEqual([{ remainingCredits: 0, minutesCharged: 5 }]);
    expect(renderAudio().connectionStatus).toBe('connected');
  });

  it('refuses to mint a free replacement when a used paid token has no resumption handle', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('paid-token', 5, 0))
      .mockResolvedValueOnce(tokenResponse('independent-token', 5, 0));
    await renderAudio().startStreaming();
    renderAudio().stopStreaming();
    await expect(renderAudio().startStreaming()).rejects.toThrow('resum');
    expect(fetch).toHaveBeenCalledOnce();
    expect(gemini.configurations).toHaveLength(1);
    expect(renderAudio().isStreaming).toBe(false);
  });

  it('resumes remaining paid time with the same token and handle after a manual stop', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('paid-token', 5, 0))
      .mockResolvedValueOnce(tokenResponse('independent-token', 5, 0));
    await renderAudio().startStreaming();
    gemini.configurations[0].callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'paid-handle' } });
    renderAudio().stopStreaming();
    await renderAudio().startStreaming();
    expect(fetch).toHaveBeenCalledOnce();
    expect(gemini.apiKeys).toEqual(['paid-token', 'paid-token']);
    expect(gemini.configurations[1].config.sessionResumption).toEqual({ handle: 'paid-handle' });
    expect(renderAudio().connectionStatus).toBe('connected');
  });

  it('resumes the final paid minute after renewal denial without retrying the denied charge', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('paid-token', 2, 0))
      .mockResolvedValueOnce(denial(402))
      .mockResolvedValueOnce(tokenResponse('independent-token', 5, 0));
    await renderAudio().startStreaming();
    gemini.configurations[0].callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'paid-handle' } });
    await vi.advanceTimersByTimeAsync(90_000);
    renderAudio().stopStreaming();
    await renderAudio().startStreaming();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(gemini.apiKeys).toEqual(['paid-token', 'paid-token']);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(renderAudio().isStreaming).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(renderAudio().isStreaming).toBe(false);
    expect(renderAudio().error).toContain('Out of voice credits');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['connect', 'worklet', 'initial input'])('preserves the original paid connection when replacement %s fails', async (failure) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('original-token', 2, 5))
      .mockResolvedValueOnce(tokenResponse('renewed-token', 7, 0));
    await renderAudio().startStreaming();
    const previous = gemini.configurations[0];
    if (failure === 'connect') gemini.connect.mockRejectedValueOnce(new Error('Replacement connect failed'));
    else if (failure === 'worklet') addWorkletModule.mockRejectedValueOnce(new Error('Replacement worklet failed'));
    else {
      const connect = gemini.connect.getMockImplementation()!;
      gemini.connect.mockImplementationOnce(async configuration => {
        const session = await connect(configuration);
        session.sendRealtimeInput.mockImplementationOnce(() => { throw new Error('Replacement input failed'); });
        return session;
      });
    }
    await vi.advanceTimersByTimeAsync(60_000);
    expect(renderAudio().isStreaming).toBe(true);
    expect(renderAudio().connectionStatus).toBe('connected');
    expect(processors[0].context.state).toBe('running');
    expect(gemini.closes[0]).not.toHaveBeenCalled();
    expect(stopTrack).not.toHaveBeenCalled();
    audioFrame(0, 0.25);
    audioFrame(0, 0.25);
    expect(gemini.sends[0].mock.calls.at(-1)![0]).toHaveProperty('audio');
    previous.callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'paid-turn', name: 'paid-tool', args: {} }] } });
    expect(gemini.toolSends[0]).toHaveBeenCalledOnce();
    if (failure !== 'connect') expect(gemini.closes[1]).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(renderAudio().isStreaming).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(renderAudio().isStreaming).toBe(false);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('keeps original input active while replacement capture is loading and ignores it after a successful swap', async () => {
    let finishWorklet!: () => void;
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('original-token', 2, 5))
      .mockResolvedValueOnce(tokenResponse('renewed-token', 7, 0));
    await renderAudio().startStreaming();
    addWorkletModule.mockImplementationOnce(() => new Promise(resolve => { finishWorklet = resolve; }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(processors[0].context.state).toBe('running');
    audioFrame(0, 0.25);
    audioFrame(0, 0.25);
    expect(gemini.sends[0].mock.calls.at(-1)![0]).toHaveProperty('audio');
    expect(gemini.sends[1]).not.toHaveBeenCalled();
    gemini.configurations[1].callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'renewed-handle' } });
    finishWorklet();
    await settleHook();
    expect(processors[0].context.state).toBe('closed');
    expect(gemini.closes[0]).toHaveBeenCalledOnce();
    const sent = gemini.sends[1].mock.calls.length;
    audioFrame(0, 0.25);
    audioFrame(0, 0.25);
    expect(gemini.sends[1]).toHaveBeenCalledTimes(sent);
    audioFrame(1, 0.25);
    audioFrame(1, 0.25);
    expect(gemini.sends[1].mock.calls.at(-1)![0]).toHaveProperty('audio');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(renderAudio().isStreaming).toBe(true);
    renderAudio().stopStreaming();
    await renderAudio().startStreaming();
    expect(gemini.configurations[2].config.sessionResumption).toEqual({ handle: 'renewed-handle' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([1000, 1006])('serializes a socket close %s with a pending renewal so its charged credential is retained', async (code) => {
    let finishRenewal!: (response: Response) => void;
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('original-token', 2, 5))
      .mockImplementationOnce(() => new Promise(resolve => { finishRenewal = resolve; }));
    await renderAudio().startStreaming();
    const previous = gemini.configurations[0];
    previous.callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'original-handle' } });
    await vi.advanceTimersByTimeAsync(60_000);
    previous.callbacks.onclose({ code, reason: 'drop while renewal pending' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(gemini.apiKeys).toEqual(['original-token']);
    finishRenewal(tokenResponse('renewed-token', 5, 0));
    await settleHook();
    expect(gemini.apiKeys).toEqual(['original-token', 'renewed-token']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(renderAudio().connectionStatus).toBe('connected');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(renderAudio().isStreaming).toBe(true);
  });

  it('does not promote a replacement after the user stops while its worklet is loading', async () => {
    let finishWorklet!: () => void;
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('original-token', 2, 5))
      .mockResolvedValueOnce(tokenResponse('renewed-token', 7, 0));
    await renderAudio().startStreaming();
    addWorkletModule.mockImplementationOnce(() => new Promise(resolve => { finishWorklet = resolve; }));
    await vi.advanceTimersByTimeAsync(60_000);
    renderAudio().stopStreaming();
    finishWorklet();
    await settleHook();
    expect(renderAudio().isStreaming).toBe(false);
    expect(processors).toHaveLength(1);
    expect(gemini.sends[1]).not.toHaveBeenCalled();
    expect(gemini.closes[1]).toHaveBeenCalled();
  });

  it('allows an unbilled student to retry without a resumption handle', async () => {
    const unbilledToken = (token: string) => Response.json({
      token, model: 'models/server-live-model', config: {}, billing: null,
      expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(unbilledToken('first-student-token'))
      .mockResolvedValueOnce(unbilledToken('second-student-token'));
    await renderAudio().startStreaming();
    renderAudio().stopStreaming();
    await renderAudio().startStreaming();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(gemini.apiKeys).toEqual(['first-student-token', 'second-student-token']);
    expect(renderAudio().connectionStatus).toBe('connected');
  });

  it('retains the paid resumption handle through two rapid socket drops', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(tokenResponse('paid-token', 5, 0));
    await renderAudio().startStreaming();
    for (let index = 0; index < 2; index++) {
      const previous = gemini.configurations[index];
      previous.callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: `paid-handle-${index}` } });
      previous.callbacks.onerror({ message: 'temporary transport error' });
      previous.callbacks.onclose({ code: 1006, reason: 'rapid drop' });
      await vi.advanceTimersByTimeAsync(1000 * 2 ** index);
      expect(gemini.configurations).toHaveLength(index + 2);
    }
    expect(gemini.configurations).toHaveLength(3);
    expect(gemini.configurations[2].config.sessionResumption).toEqual({ handle: 'paid-handle-1' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(renderAudio().connectionStatus).toBe('connected');
  });

  it('expires an initial paid connection that never finishes opening and closes its late socket', async () => {
    let finishConnect!: (session: { close: () => void }) => void;
    const close = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(tokenResponse('paid-token', 2, 0));
    gemini.connect.mockImplementationOnce(() => new Promise(resolve => { finishConnect = resolve; }));
    const starting = renderAudio().startStreaming();
    await settleHook();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(renderAudio().isStreaming).toBe(false);
    expect(stopTrack).toHaveBeenCalledOnce();
    finishConnect({ close });
    await starting;
    expect(close).toHaveBeenCalledOnce();
    expect(renderAudio().connectionStatus).toBe('disconnected');
  });

  it.each([402, 403])('resumes remaining paid time when a pending HTTP %s renewal fails after the original socket drops', async status => {
    let finishRenewal!: (response: Response) => void;
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('original-token', 2, 5))
      .mockImplementationOnce(() => new Promise(resolve => { finishRenewal = resolve; }));
    await renderAudio().startStreaming();
    const previous = gemini.configurations[0];
    previous.callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'original-handle' } });
    await vi.advanceTimersByTimeAsync(60_000);
    previous.callbacks.onclose({ code: 1006, reason: 'drop while renewal pending' });
    finishRenewal(denial(status));
    await settleHook();
    expect(renderAudio().connectionStatus).toBe('connected');
    expect(gemini.apiKeys).toEqual(['original-token', 'original-token']);
    expect(gemini.configurations[1].config.sessionResumption).toEqual({ handle: 'original-handle' });
    audioFrame(1, 0.25);
    audioFrame(1, 0.25);
    expect(gemini.sends[1].mock.calls.at(-1)![0]).toHaveProperty('audio');
    await vi.advanceTimersByTimeAsync(59_999);
    expect(renderAudio().isStreaming).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(renderAudio().isStreaming).toBe(false);
    expect(renderAudio().error).toContain(`HTTP ${status}`);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([502, 409])('retries a renewal that failed with HTTP %s and keeps talking into the next block', async (status) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('original-token', 2, 5))
      .mockResolvedValueOnce(denial(status))
      .mockResolvedValueOnce(tokenResponse('renewed-token', 6, 0));
    await renderAudio().startStreaming();
    gemini.configurations[0].callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'original-handle' } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(renderAudio().connectionStatus).toBe('connected');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(requestBody(2)).toMatchObject({ grantId, resumptionHandle: 'original-handle' });
    expect(gemini.apiKeys).toEqual(['original-token', 'renewed-token']);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(renderAudio().isStreaming).toBe(true);
    expect(renderAudio().error).toBe('');
    renderAudio().stopStreaming();
  });

  it('stops retrying a failing renewal shortly before the paid block ends', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('original-token', 2, 5))
      .mockResolvedValue(denial(502));
    await renderAudio().startStreaming();
    await vi.advanceTimersByTimeAsync(119_999);
    expect(renderAudio().isStreaming).toBe(true);
    // One renewal at 60s, then retries every 10s while more than 15s remain.
    expect(fetch).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(1);
    expect(renderAudio().isStreaming).toBe(false);
    expect(renderAudio().error).toContain('HTTP 502');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it('reuses the next block it already paid for when the replacement connection fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('original-token', 2, 5))
      .mockResolvedValueOnce(tokenResponse('renewed-token', 7, 0));
    await renderAudio().startStreaming();
    gemini.configurations[0].callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'original-handle' } });
    gemini.connect.mockRejectedValueOnce(new Error('Replacement connect failed'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(renderAudio().connectionStatus).toBe('connected');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(gemini.apiKeys.slice(-1)).toEqual(['renewed-token']);
    expect(gemini.configurations.at(-1)!.config.sessionResumption).toEqual({ handle: 'original-handle' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(renderAudio().isStreaming).toBe(true);
    expect(renderAudio().error).toBe('');
    renderAudio().stopStreaming();
  });

  it('recovers a promoted replacement that closes while its queued messages are being delivered', async () => {
    let finishWorklet!: () => void;
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse('original-token', 2, 5))
      .mockResolvedValueOnce(tokenResponse('renewed-token', 7, 0));
    await renderAudio().startStreaming();
    addWorkletModule.mockImplementationOnce(() => new Promise(resolve => { finishWorklet = resolve; }));
    await vi.advanceTimersByTimeAsync(60_000);
    const replacement = gemini.configurations[1];
    replacement.callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'renewed-handle' } });
    replacement.callbacks.onmessage({ toolCall: { functionCalls: [{ id: 'queued', name: 'queued-tool', args: {} }] } });
    gemini.toolSends[1].mockImplementationOnce(() => replacement.callbacks.onclose({ code: 1006, reason: 'drop during queued tool delivery' }));
    finishWorklet();
    await settleHook();
    await vi.advanceTimersByTimeAsync(1000);
    expect(gemini.configurations).toHaveLength(3);
    expect(gemini.apiKeys).toEqual(['original-token', 'renewed-token', 'renewed-token']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(renderAudio().connectionStatus).toBe('connected');
  });
});
