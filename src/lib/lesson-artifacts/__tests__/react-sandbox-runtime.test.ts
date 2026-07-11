import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  fetchReactSandboxSources,
  REACT_SANDBOX_SOURCES,
  renderReactSandboxScripts,
} from '../react-sandbox-runtime';

describe('React sandbox runtime', () => {
  it('uses pinned classic scripts with an explicit boot failure', () => {
    expect(REACT_SANDBOX_SOURCES).toEqual({
      react: '/lesson-runtime/react-18.3.1.production.min.js',
      reactDom: '/lesson-runtime/react-dom-18.3.1.production.min.js',
    });

    const scripts = renderReactSandboxScripts('nonce-1', {
      react: 'window.React = { version: "18.3.1" };',
      reactDom: 'window.ReactDOM = { createRoot: function () {} };',
    });
    expect(scripts).toContain('nonce="nonce-1"');
    expect(scripts).toContain('window.React');
    expect(scripts).toContain('window.ReactDOM');
    expect(scripts).toContain('Failed to load React runtime');
    expect(scripts).not.toContain('type="module"');
    expect(scripts).not.toContain(' src=');
  });

  it('loads pinned runtime text through the trusted parent page', async () => {
    const fetcher = async (input: RequestInfo | URL) => ({
      ok: true,
      text: async () => String(input).includes('react-dom') ? 'react-dom-source' : 'react-source',
    }) as Response;

    await expect(fetchReactSandboxSources(fetcher)).resolves.toEqual({
      react: 'react-source',
      reactDom: 'react-dom-source',
    });
  });

  it('keeps generated code in an opaque-origin sandbox', async () => {
    const renderer = await readFile(
      join(process.cwd(), 'src', 'components', 'lessons', 'ReactRenderer.tsx'),
      'utf8',
    );

    expect(renderer).toContain('sandbox="allow-scripts"');
    expect(renderer).not.toContain('sandbox="allow-scripts allow-same-origin"');
  });

  it('loads optional Tailwind styling only after the component reports ready', async () => {
    const renderer = await readFile(
      join(process.cwd(), 'src', 'components', 'lessons', 'ReactRenderer.tsx'),
      'utf8',
    );

    expect(renderer).not.toContain('<script src="https://cdn.tailwindcss.com"');
    expect(renderer).not.toContain('<script async src="https://cdn.tailwindcss.com"');
    expect(renderer).toContain('setTimeout(loadOptionalTailwind, 0)');
    expect(renderer).not.toContain('window.tailwind = window.tailwind || {}');
    expect(renderer).toContain("tailwindScript.addEventListener('load'");
  });

  it('does not wait for an animation frame while the preview iframe is hidden', async () => {
    const renderer = await readFile(
      join(process.cwd(), 'src', 'components', 'lessons', 'ReactRenderer.tsx'),
      'utf8',
    );

    expect(renderer).toContain('ReactDOM.flushSync(function ()');
    expect(renderer).not.toContain('requestAnimationFrame(function ()');
  });
});
