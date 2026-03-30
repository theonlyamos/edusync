import 'dotenv/config'
import { type JobContext, cli, defineAgent, getJobContext, llm, voice, ServerOptions } from '@livekit/agents'
import * as google from '@livekit/agents-plugin-google'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { EUREKA_TUTOR_SYSTEM_PROMPT } from '../eureka-prompt.js'

const appBase = (process.env.LIVE_CLASS_APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
const agentSecret = process.env.LIVE_CLASS_AGENT_SECRET || ''

function learningSessionIdFromRoomMetadata(meta: string | undefined): string {
  if (!meta) return ''
  try {
    const m = JSON.parse(meta) as { learning_session_id?: string }
    return typeof m.learning_session_id === 'string' ? m.learning_session_id : ''
  } catch {
    return ''
  }
}

/**
 * Validates room context and env, then returns the resolved sessionId.
 * Throws ToolError if anything is misconfigured so the model gets a clear message.
 */
function requireSessionContext(): string {
  const room = getJobContext().room
  const sessionId = learningSessionIdFromRoomMetadata(room.metadata)
  if (!sessionId) {
    throw new llm.ToolError('Room is missing learning_session_id in metadata. A participant must join from the app first.')
  }
  if (!appBase || !agentSecret) {
    throw new llm.ToolError('LIVE_CLASS_APP_BASE_URL and LIVE_CLASS_AGENT_SECRET must be set on the worker.')
  }
  return sessionId
}

const agentHeaders = {
  'Content-Type': 'application/json',
  'x-live-class-agent-secret': agentSecret,
} as const

/**
 * Fire-and-forget POST to one of the agent API routes.
 * Gemini realtime blocks all audio until sendToolResponse, so tool execute
 * functions must not await HTTP calls.
 */
function postInBackground(path: string, body: Record<string, unknown>): void {
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
    const sessionId = requireSessionContext()
    postInBackground('/api/live-classes/agent/persist-visualization', {
      session_id: sessionId,
      task_description,
      description: description ?? null,
    })
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
    const sessionId = requireSessionContext()
    postInBackground('/api/live-classes/agent/persist-session-topic', {
      session_id: sessionId,
      topic: t,
    })
    return `Topic noted: ${t}`
  },
})

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const agent = new voice.Agent({
      instructions: EUREKA_TUTOR_SYSTEM_PROMPT,
      tools: {
        generate_visualization_description: generateVisualizationDescription,
        set_topic: setTopic,
      },
    })

    const model =
      process.env.GEMINI_LIVE_MODEL ||
      process.env.GOOGLE_LIVE_MODEL ||
      'gemini-2.5-flash-native-audio-preview-12-2025'

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
