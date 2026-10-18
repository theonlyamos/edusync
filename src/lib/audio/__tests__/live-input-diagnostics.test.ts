import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitLiveInputDiagnostic, LIVE_INPUT_DIAGNOSTIC_EVENT } from '../live-input-diagnostics';

let details: Array<Record<string, unknown>>;

beforeEach(() => {
  details = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
  vi.stubGlobal('window', new EventTarget());
  window.addEventListener(LIVE_INPUT_DIAGNOSTIC_EVENT, event => details.push((event as CustomEvent<Record<string, unknown>>).detail));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('live input timing diagnostics', () => {
  it('emits only fixed labels and numeric metadata from an input containing private fields', () => {
    const input = {
      event: 'sent' as const, connectionGeneration: 2, kind: 'audio' as const, source: 'microphone' as const, audioBytes: 8192,
      text: 'PRIVATE_TRANSCRIPT', data: 'PRIVATE_BASE64', apiKey: 'PRIVATE_CREDENTIAL', url: 'https://private.invalid', id: 'PRIVATE_CALL_ID',
    };
    emitLiveInputDiagnostic(input);
    expect(details).toEqual([{
      event: 'sent', timestampMs: Date.now(), connectionGeneration: 2, kind: 'audio', source: 'microphone', audioBytes: 8192,
    }]);
    expect(JSON.stringify(details)).not.toContain('PRIVATE_');
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('rejects invalid connection generation %s', connectionGeneration => {
    emitLiveInputDiagnostic({ event: 'sent', connectionGeneration, kind: 'text', source: 'user' });
    expect(details).toEqual([]);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('omits invalid audio byte count %s', audioBytes => {
    emitLiveInputDiagnostic({ event: 'sent', connectionGeneration: 0, kind: 'audio', source: 'microphone', audioBytes });
    expect(details).toEqual([{
      event: 'sent', timestampMs: Date.now(), connectionGeneration: 0, kind: 'audio', source: 'microphone',
    }]);
  });

  it('drops unknown labels and mismatched kind/source pairs without exposing them', () => {
    const invalid = [
      { event: 'PRIVATE_EVENT', connectionGeneration: 1 },
      { event: 'sent', connectionGeneration: 1, kind: 'PRIVATE_KIND', source: 'user' },
      { event: 'sent', connectionGeneration: 1, kind: 'text', source: 'PRIVATE_SOURCE' },
      { event: 'sent', connectionGeneration: 1, kind: 'audio', source: 'viewport' },
    ];
    for (const input of invalid) emitLiveInputDiagnostic(input as Parameters<typeof emitLiveInputDiagnostic>[0]);
    expect(details).toEqual([]);
  });

  it('omits audio-only metadata on text and received interruption events', () => {
    emitLiveInputDiagnostic({ event: 'sent', connectionGeneration: 1, kind: 'text', source: 'quiz', audioBytes: 8192 });
    const interruption = { event: 'server-interrupted' as const, connectionGeneration: 1, audioBytes: 8192, text: 'PRIVATE_TEXT' };
    emitLiveInputDiagnostic(interruption);
    expect(details).toEqual([
      { event: 'sent', timestampMs: Date.now(), connectionGeneration: 1, kind: 'text', source: 'quiz' },
      { event: 'server-interrupted', timestampMs: Date.now(), connectionGeneration: 1 },
    ]);
  });

  it('contains unavailable or throwing event dispatch without affecting the caller', () => {
    vi.stubGlobal('window', { dispatchEvent: () => { throw new Error('PRIVATE_OBSERVER_ERROR'); } });
    expect(() => emitLiveInputDiagnostic({ event: 'sent', connectionGeneration: 1, kind: 'video', source: 'visual' })).not.toThrow();
    vi.stubGlobal('window', undefined);
    expect(() => emitLiveInputDiagnostic({ event: 'sent', connectionGeneration: 1, kind: 'tool', source: 'tool' })).not.toThrow();
  });
});
