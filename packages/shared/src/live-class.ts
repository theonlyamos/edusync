/** Lesson context serialized into LiveKit room metadata for the live-class agent. */
export type LiveClassRoomLessonMetadata = {
  title: string
  subject: string
  gradeLevel: string
  objectives: string[]
  content: string
}

/** Header carrying the shared secret on agent → app callbacks. */
export const LIVE_CLASS_AGENT_SECRET_HEADER = 'x-live-class-agent-secret'
