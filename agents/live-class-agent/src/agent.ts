import 'dotenv/config'
import { type JobContext, cli, defineAgent, getJobContext, llm, voice, ServerOptions } from '@livekit/agents'
import * as google from '@livekit/agents-plugin-google'
import type { Room } from '@livekit/rtc-node'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { EUREKA_TUTOR_SYSTEM_PROMPT } from '../eureka-prompt.js'

const appBase = (process.env.LIVE_CLASS_APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
const agentSecret = process.env.LIVE_CLASS_AGENT_SECRET || ''

type RoomMetaLesson = {
  title: string
  subject: string
  gradeLevel: string
  objectives: string[]
  content: string
}

function parseMeta(meta: string | undefined): { learning_session_id: string; lesson?: RoomMetaLesson } {
  if (!meta) return { learning_session_id: '' }
  try {
    const m = JSON.parse(meta) as {
      learning_session_id?: string
      lesson?: {
        title?: string
        subject?: string
        gradeLevel?: string
        objectives?: unknown
        content?: string
      }
    }
    const learning_session_id =
      typeof m.learning_session_id === 'string' ? m.learning_session_id : ''
    let lesson: RoomMetaLesson | undefined
    if (m.lesson && typeof m.lesson.title === 'string') {
      const objs = m.lesson.objectives
      lesson = {
        title: m.lesson.title,
        subject: typeof m.lesson.subject === 'string' ? m.lesson.subject : '',
        gradeLevel: typeof m.lesson.gradeLevel === 'string' ? m.lesson.gradeLevel : '',
        objectives: Array.isArray(objs)
          ? objs.filter((o): o is string => typeof o === 'string')
          : [],
        content: typeof m.lesson.content === 'string' ? m.lesson.content : '',
      }
    }
    return { learning_session_id, lesson }
  } catch {
    return { learning_session_id: '' }
  }
}

function lessonContextBlock(lesson: RoomMetaLesson): string {
  const objectivesText = lesson.objectives?.length
    ? lesson.objectives.map((o) => `- ${o}`).join('\n')
    : 'No specific objectives provided.'
  return `\n\n### **Lesson Context**\n\nYou are teaching a live class based on a specific lesson:\n- **Lesson:** ${lesson.title}\n- **Subject:** ${lesson.subject || 'Not specified'}\n- **Grade Level:** ${lesson.gradeLevel || 'Not specified'}\n\n**Learning Objectives:**\n${objectivesText}\n\n**Lesson Content:**\n${lesson.content || 'No content provided.'}\n\nFocus your teaching on these objectives. Use the lesson material as the foundation for explanations, visualizations, and quizzes.`
}

type SessionContext = { room: Room; sessionId: string }

/**
 * Validates room context and env, then returns room + sessionId.
 * Throws ToolError if anything is misconfigured so the model gets a clear message.
 */
function requireSessionContext(): SessionContext {
  const room = getJobContext().room
  const sessionId = parseMeta(room.metadata).learning_session_id
  if (!sessionId) {
    throw new llm.ToolError('Room is missing learning_session_id in metadata. A participant must join from the app first.')
  }
  if (!appBase || !agentSecret) {
    throw new llm.ToolError('LIVE_CLASS_APP_BASE_URL and LIVE_CLASS_AGENT_SECRET must be set on the worker.')
  }
  return { room, sessionId }
}

const agentHeaders = {
  'Content-Type': 'application/json',
  'x-live-class-agent-secret': agentSecret,
} as const

function broadcastToRoom(room: Room, payload: Record<string, unknown>): void {
  const lp = room.localParticipant
  if (!lp) {
    console.warn('[live-class-agent] broadcastToRoom: no localParticipant')
    return
  }
  void lp
    .publishData(new TextEncoder().encode(JSON.stringify(payload)), {
      reliable: true,
      topic: 'agent',
    })
    .catch((e) => console.error('[live-class-agent] publishData failed:', e))
}

/**
 * Fire-and-forget POST to one of the agent API routes.
 * Gemini realtime blocks all audio until sendToolResponse, so tool execute
 * functions must not await HTTP calls.
 */
function postInBackground(
  path: string,
  body: Record<string, unknown>,
  onSuccess?: (data: unknown) => void,
): void {
  void (async () => {
    try {
      const res = await fetch(`${appBase}${path}`, {
        method: 'POST',
        headers: agentHeaders,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const t = await res.text()
        console.error(`[live-class-agent] ${path} failed:`, t)
        return
      }
      if (onSuccess) {
        try {
          onSuccess(await res.json())
        } catch {
          console.error(`[live-class-agent] ${path}: invalid JSON response`)
        }
      }
    } catch (e) {
      console.error(`[live-class-agent] ${path} error:`, e)
    }
  })()
}

const generateVisualizationDescription = llm.tool({
  description:
    'Generate an interactive or visual teaching aid. Call whenever you would show, draw, or demonstrate something to the class.',
  parameters: z.object({
    task_description: z
      .string()
      .describe('Rich spec for the visualization (layout, interactions, quiz structure, colors).'),
    description: z.string().optional().describe('Short label for the timeline.'),
  }),
  execute: async ({ task_description, description }) => {
    const { room, sessionId } = requireSessionContext()
    postInBackground(
      '/api/live-classes/agent/persist-visualization',
      {
        session_id: sessionId,
        task_description,
        description: description ?? null,
      },
      (data) => {
        if (data && typeof data === 'object' && 'id' in data) {
          broadcastToRoom(room, { type: 'visualization', ...(data as Record<string, unknown>) })
        }
      },
    )
    return 'Visualization is being generated. Students will see it shortly. Continue teaching.'
  },
})

const setTopic = llm.tool({
  description:
    'Call at the start of a new main topic or when the learner shifts subjects. Use a concise 3–8 word title-cased phrase.',
  parameters: z.object({
    topic: z.string().describe('Topic title, e.g. How Photosynthesis Works'),
  }),
  execute: async ({ topic }) => {
    const t = typeof topic === 'string' ? topic.trim() : ''
    if (!t) return 'No topic text was provided.'
    const { room, sessionId } = requireSessionContext()
    broadcastToRoom(room, { type: 'set_topic', topic: t })
    postInBackground('/api/live-classes/agent/persist-session-topic', {
      session_id: sessionId,
      topic: t,
    })
    return `Topic noted: ${t}`
  },
})

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const meta = parseMeta(ctx.room.metadata)
    let instructions = EUREKA_TUTOR_SYSTEM_PROMPT
    if (meta.lesson) {
      instructions += lessonContextBlock(meta.lesson)
    }

    const agent = new voice.Agent({
      instructions,
      tools: {
        generate_visualization_description: generateVisualizationDescription,
        set_topic: setTopic,
      },
    })

    const model =
      process.env.GEMINI_LIVE_MODEL ||
      process.env.GOOGLE_LIVE_MODEL ||
      'gemini-3.1-flash-live-preview'

    const session = new voice.AgentSession({
      llm: new google.beta.realtime.RealtimeModel({
        model,
        voice: (process.env.GEMINI_VOICE as 'Zephyr' | undefined) || 'Zephyr',
        temperature: 0.75,
        instructions:
          'You are Eureka, a live class tutor. Multiple students may speak. Teach visually and call tools as specified in your instructions.',
      }),
    })

    await session.start({
      agent,
      room: ctx.room,
    })

    await ctx.connect()
  },
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const agentName = (process.env.LIVEKIT_AGENT_NAME || '').trim()
  cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName }))
}
