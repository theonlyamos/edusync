export const CODING_LANGUAGES = ['javascript', 'typescript', 'python', 'html', 'css', 'json', 'java', 'c', 'cpp', 'csharp', 'sql', 'plaintext'] as const

export type CodingEditorRequest = { code: string; language: typeof CODING_LANGUAGES[number] }

export function createCodingEditorToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('')
}

export function readCodingEditorRequest(event: Pick<MessageEvent, 'source' | 'origin' | 'data'>, frame: Window | null, token: string, userActivated = false): CodingEditorRequest | null {
  if (!userActivated || !frame || event.source !== frame || event.origin !== 'null') return null
  try {
    const data = event.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const fields = Object.getOwnPropertyDescriptors(data)
    if (Object.keys(fields).sort().join(',') !== 'code,language,token,type' || Object.values(fields).some(field => !('value' in field))) return null
    const { type, token: receivedToken, code, language } = data
    if (type !== 'lesson-open-code-editor' || !/^[a-f0-9]{32}$/.test(token) || receivedToken !== token ||
      typeof code !== 'string' || code.length > 50_000 || !CODING_LANGUAGES.includes(language)) return null
    return { code, language }
  } catch { return null }
}

export function codingEditorBridgeScript(token: string, parentOrigin: string): string {
  return `window.openCodeEditor = function(request) {
    if (!navigator.userActivation?.isActive || !request || typeof request !== 'object') return;
    window.parent.postMessage({type:'lesson-open-code-editor',token:${JSON.stringify(token)},code:request.code,language:request.language || 'javascript'},${JSON.stringify(parentOrigin === 'null' ? '*' : parentOrigin)});
  };`
}
