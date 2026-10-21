export class VoiceTokenRequestError extends Error {
  constructor(readonly status: number, readonly payer: 'school' | 'personal' | null = null) {
    const schoolPays = status === 402 && payer === 'school';
    const message = schoolPays
      ? 'Your school is out of tutor minutes'
      : status === 402
      ? 'Out of voice credits'
      : status === 401
      ? 'Voice authorization failed'
      : status === 403
        ? 'Voice access was denied'
        : status === 429
          ? 'Voice request limit reached'
          : 'Voice token request failed';
    const nextStep = schoolPays
      ? 'Ask your teacher or school admin to add credits.'
      : status === 402
      ? 'Buy more credits to keep talking.'
      : status === 401
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
