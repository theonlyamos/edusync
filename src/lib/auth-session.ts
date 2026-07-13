export function shouldClearInvalidRefreshSession(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : String(error ?? '');
  const normalized = message.toLowerCase().replace(/[_-]+/g, ' ');
  return normalized.includes('refresh token') && (
    normalized.includes('invalid') ||
    normalized.includes('not found') ||
    normalized.includes('missing')
  );
}
