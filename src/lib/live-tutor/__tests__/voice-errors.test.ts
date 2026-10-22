import { describe, expect, it } from 'vitest';
import { voiceErrorMessage } from '../voice-errors';

const domError = (name: string, message = '') => Object.assign(new Error(message), { name });

describe('voiceErrorMessage', () => {
  it('explains a missing microphone in plain words', () => {
    expect(voiceErrorMessage(domError('NotFoundError', 'Requested device not found'))).toMatch(/can't find a microphone/);
  });
  it('explains blocked microphone access', () => {
    expect(voiceErrorMessage(domError('NotAllowedError', 'Permission denied'))).toMatch(/blocked/);
  });
  it('keeps messages the server wrote for students', () => {
    expect(voiceErrorMessage(new Error('Your school is out of credits.'))).toBe('Your school is out of credits.');
  });
  it('falls back to a connection message for network failures', () => {
    expect(voiceErrorMessage(new TypeError('Failed to fetch'))).toMatch(/could not connect/);
    expect(voiceErrorMessage(null, 'resume')).toMatch(/dropped/);
  });
});
