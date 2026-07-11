export const REACT_SANDBOX_SOURCES = {
  react: '/lesson-runtime/react-18.3.1.production.min.js',
  reactDom: '/lesson-runtime/react-dom-18.3.1.production.min.js',
} as const;

export type ReactSandboxSourceText = { react: string; reactDom: string };

export async function fetchReactSandboxSources(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<ReactSandboxSourceText> {
  const [reactResponse, reactDomResponse] = await Promise.all([
    fetcher(REACT_SANDBOX_SOURCES.react),
    fetcher(REACT_SANDBOX_SOURCES.reactDom),
  ]);
  if (!reactResponse.ok || !reactDomResponse.ok) throw new Error('Failed to load React runtime assets');
  const [react, reactDom] = await Promise.all([reactResponse.text(), reactDomResponse.text()]);
  return { react, reactDom };
}

const escapeInlineScript = (source: string) => source.replace(/<\/script/gi, '<\\/script');

export function renderReactSandboxScripts(nonce: string, sources: ReactSandboxSourceText): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(nonce)) throw new Error('Invalid sandbox script nonce');
  return `
  <script nonce="${nonce}">${escapeInlineScript(sources.react)}</script>
  <script nonce="${nonce}">${escapeInlineScript(sources.reactDom)}</script>
  <script nonce="${nonce}">
    if (!window.React || !window.ReactDOM) {
      reportLessonRenderError(new Error('Failed to load React runtime'));
    } else {
      window.reactLoaded = true;
      window.reactDOMLoaded = true;
    }
  </script>`;
}
