/**
 * Re-export of the shared Eureka tutor persona. Canonical source lives in
 * `@edusync/shared/tutor-prompt` so the web app and the live-class agent stay
 * in sync. Existing importers (e.g. useAudioStreaming) keep this path.
 */
export { EUREKA_TUTOR_SYSTEM_PROMPT } from '@edusync/shared/tutor-prompt'
