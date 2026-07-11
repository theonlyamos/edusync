export const DEFAULT_LEARNING_FALLBACK_LIMIT = 6;

export function parseLearningFallbackLimit(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_LEARNING_FALLBACK_LIMIT;
}

export function canReserveLearningFallback(input: { used: number; limit: number }): boolean {
  return input.used >= 0 && input.limit > 0 && input.used < input.limit;
}
