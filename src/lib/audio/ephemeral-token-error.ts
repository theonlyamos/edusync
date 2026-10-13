export class VoiceTokenRequestError extends Error {
  constructor(readonly status: number) {
    const message = status === 401
      ? 'Voice authorization failed'
      : status === 403
        ? 'Voice access was denied'
        : status === 429
          ? 'Voice request limit reached'
          : 'Voice token request failed';
    const nextStep = status === 401
      ? 'Please sign in again or check the API key.'
      : status === 403
        ? 'Check the session or API key access permissions.'
        : status === 429
          ? 'Please wait before trying again.'
          : 'Please try again.';
    super(`${message} (HTTP ${status}). ${nextStep}`);
    this.name = 'VoiceTokenRequestError';
  }
}
