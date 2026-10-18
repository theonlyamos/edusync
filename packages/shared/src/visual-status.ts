/**
 * Messages that tell the Gemini Live tutor whether a visual actually reached the
 * screen. Shared by the web app's voice tutor and the live-class agent.
 */

/** Immediate tool response for visual tools: honest that nothing is on screen yet. */
export const VISUAL_PENDING_TOOL_RESPONSE =
  'The visual is being prepared and is NOT on screen yet. Keep teaching the idea out loud, but do not describe the visual, its contents, or ask the learner to interact with it until you receive a VISUAL_STATUS message.';

export type VisualStatusReport =
  | { status: 'ready'; explanation?: string; taskDescription?: string }
  | { status: 'failed'; reason?: string; taskDescription?: string };

const MAX_FIELD_LENGTH = 600;

function clip(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_FIELD_LENGTH ? `${trimmed.slice(0, MAX_FIELD_LENGTH)}…` : trimmed;
}

export function formatVisualStatusMessage(report: VisualStatusReport): string {
  const payload: Record<string, string> = { status: report.status };
  const task = clip(report.taskDescription);
  if (task) payload.requested = task;
  if (report.status === 'ready') {
    const explanation = clip(report.explanation);
    if (explanation) payload.onScreen = explanation;
  } else {
    payload.reason = clip(report.reason) ?? 'unknown error';
  }
  return `VISUAL_STATUS ${JSON.stringify(payload)}`;
}
