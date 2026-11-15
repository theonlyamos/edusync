import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { sketchSignatureMessage } from './sketch';

/**
 * Sketch code is drawn on the server and handed to the browser. Signing it
 * means "keep this sketch" can only store code the server actually produced,
 * never code someone pasted in.
 */
function sketchKey() {
  const secret = process.env.SKETCH_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('No secret is configured for signing sketches');
  return createHmac('sha256', secret).update('insyte:lesson-sketch:v1').digest();
}

export function signSketch(input: Parameters<typeof sketchSignatureMessage>[0]) {
  return createHmac('sha256', sketchKey()).update(sketchSignatureMessage(input)).digest('hex');
}

export function verifySketch(input: Parameters<typeof sketchSignatureMessage>[0], signature: string) {
  const expected = Buffer.from(signSketch(input), 'hex');
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
