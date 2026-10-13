import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hookHarness, settleHook } from '../../../../hooks/__tests__/hookHarness';

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  ...await import('../../../../hooks/__tests__/hookHarness').then(({ hookHarness: hooks }) => ({
    useState: hooks.useState, useRef: hooks.useRef, useCallback: hooks.useCallback,
    useMemo: hooks.useMemo, useEffect: hooks.useEffect, useReducer: hooks.useReducer,
  })),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: () => {} }),
  useParams: () => ({ id: 'saved-session' }),
}));
vi.mock('axios', () => ({ default: {
  get: async (url: string) => ({ data: url === '/api/credits/status' ? { credits: 10 } : {} }),
  patch: async () => ({ data: {} }),
} }));

import { TutorExperience } from '../TutorExperience';
import { VoiceControl } from '../../../voice/VoiceControl';
import { StartButtonOverlay } from '../../../voice/StartButtonOverlay';
import LearnSessionPage from '../../../../app/learn/[id]/page';

function findElement(output: unknown, type: unknown): ReactElement<any> | undefined {
  if (Array.isArray(output)) return output.map((item) => findElement(item, type)).find(Boolean);
  if (!isValidElement<{ children?: unknown }>(output)) return undefined;
  if (output.type === type) return output;
  return findElement(output.props.children, type);
}

const safeError = 'Voice token request failed (HTTP 503). Please try again.';
const renderTutor = () => hookHarness.render(() => TutorExperience({
  variant: 'student', apiKey: null, getFeedback: false, debugMode: false, initialTopic: null,
}));
const renderLearnSession = () => hookHarness.render(() => {
  const child = LearnSessionPage().props.children as ReactElement;
  return (child.type as () => ReactElement)();
});

beforeEach(() => {
  hookHarness.reset();
  vi.useFakeTimers();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
});

afterEach(() => {
  hookHarness.unmount();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('tutor voice startup recovery', () => {
  it('makes a failed startup inactive and presents its error to the next start overlay', () => {
    let output = renderTutor();
    findElement(output, StartButtonOverlay)!.props.onStart();
    output = renderTutor();
    const voice = findElement(output, VoiceControl)!;
    expect(voice.props.active).toBe(true);
    expect(voice.props.onStartupFailed).toBeTypeOf('function');
    voice.props.onError(safeError);
    voice.props.onStartupFailed();
    output = renderTutor();
    expect(findElement(output, VoiceControl)!.props.active).toBe(false);
    const overlay = findElement(output, StartButtonOverlay)!;
    expect(overlay.props.error).toBe(safeError);
    overlay.props.onStart();
    output = renderTutor();
    expect(findElement(output, VoiceControl)!.props.active).toBe(true);
    expect(findElement(output, StartButtonOverlay)!.props.error).toBe('');
  });

  it('keeps ordinary socket error reporting separate from failed startup deactivation', () => {
    let output = renderTutor();
    findElement(output, StartButtonOverlay)!.props.onStart();
    output = renderTutor();
    findElement(output, VoiceControl)!.props.onError('Temporary socket error');
    output = renderTutor();
    expect(findElement(output, VoiceControl)!.props.active).toBe(true);
  });

  it('renders an authorization failure visibly within the start overlay', () => {
    const props = { onStart: () => {}, connectionStatus: 'disconnected' as const, hideCredits: true, error: safeError };
    const html = renderToStaticMarkup(createElement(StartButtonOverlay, props));
    expect(html).toContain('role="alert"');
    expect(html).toContain(safeError);
    expect(html).toContain('Try again');
  });

  it('lets the saved-session page explicitly retry a failure without its auto-start effect retrying', async () => {
    renderLearnSession();
    await settleHook();
    renderLearnSession();
    let output = renderLearnSession();
    let voice = findElement(output, VoiceControl)!;
    expect(voice.props.active).toBe(true);
    expect(voice.props.onStartupFailed).toBeTypeOf('function');
    voice.props.onConnectionStatusChange('connected');
    output = renderLearnSession();
    voice = findElement(output, VoiceControl)!;
    voice.props.onError(safeError);
    voice.props.onStartupFailed();
    voice.props.onConnectionStatusChange('disconnected');
    renderLearnSession();
    await settleHook();
    output = renderLearnSession();
    expect(findElement(output, VoiceControl)!.props.active).toBe(false);
    const overlay = findElement(output, StartButtonOverlay)!;
    expect(overlay.props.error).toBe(safeError);
    renderLearnSession();
    expect(findElement(renderLearnSession(), VoiceControl)!.props.active).toBe(false);
    overlay.props.onStart();
    output = renderLearnSession();
    expect(findElement(output, VoiceControl)!.props.active).toBe(true);
    expect(findElement(output, StartButtonOverlay)!.props.error).toBe('');
  });
});
