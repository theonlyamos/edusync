/** Turns a voice start/resume failure into a message a student can act on. */
export function voiceErrorMessage(err: unknown, action: 'start' | 'resume' = 'start') {
  const name = (err as { name?: string } | null)?.name ?? '';
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || /requested device not found/i.test(message)) {
    return "We can't find a microphone. Plug one in or check your device settings, then try again. You can also type your questions in the Study Companion.";
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /permission denied/i.test(message)) {
    return 'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.';
  }
  if (name === 'NotReadableError' || /could not start audio source/i.test(message)) {
    return 'Your microphone is being used by another app. Close that app, then try again.';
  }
  if (name === 'NotSupportedError' || name === 'SecurityError') {
    return "This browser can't use the microphone here. Try an up-to-date Chrome, Edge or Safari.";
  }
  // Server messages (credits, homework pause) are already written for students.
  if (message && !/^(failed to fetch|network ?error|load failed)$/i.test(message)) return message;
  return action === 'resume'
    ? 'The voice connection dropped and could not reconnect. Check your internet connection and try again.'
    : 'The voice tutor could not connect. Check your internet connection and try again.';
}
