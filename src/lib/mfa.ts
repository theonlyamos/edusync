/** Two-step sign-in: a password, then a six-digit code from an authenticator app. */

type Factor = { status?: string | null; factor_type?: string | null };

/** True when the account has finished setting up an authenticator app. */
export const hasSecondStep = (factors: readonly Factor[] | null | undefined) =>
  Boolean(factors?.some((factor) => factor.status === 'verified'));

/**
 * How far a sign-in got, read from its access token: "aal1" is password only,
 * "aal2" means the code was entered too. Only call this on a token the auth
 * server has already checked.
 */
export function assuranceLevel(accessToken: string | null | undefined): string | null {
  const payload = accessToken?.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { aal?: unknown };
    return typeof json.aal === 'string' ? json.aal : null;
  } catch {
    return null;
  }
}

/** An account with an authenticator app is only signed in once its code has been entered. */
export const secondStepPending = (factors: readonly Factor[] | null | undefined, accessToken: string | null | undefined) =>
  hasSecondStep(factors) && assuranceLevel(accessToken) !== 'aal2';

/** Keeps the digits of a typed code, up to six. */
export const cleanCode = (value: string) => value.replace(/\D/g, '').slice(0, 6);
