import 'dotenv/config'
import { type JobContext, cli, defineAgent, getJobContext, llm, voice, WorkerOptions } from '@livekit/agents'
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
    const room = getJobContext().room
    const sessionId = learningSessionIdFromRoomMetadata(room.metadata)
    if (!sessionId) {
      throw new llm.ToolError('Room is missing learning_session_id in metadata. A participant must join from the app first.')
    }
    if (!appBase || !agentSecret) {
      throw new llm.ToolError('LIVE_CLASS_APP_BASE_URL and LIVE_CLASS_AGENT_SECRET must be set on the worker.')
    }
    const res = await fetch(`${appBase}/api/live-classes/agent/persist-visualization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-live-class-agent-secret': agentSecret,
      },
      body: JSON.stringify({
        session_id: sessionId,
        task_description,
        description: description ?? null,
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      throw new llm.ToolError(`Visualize failed: ${t}`)
    }
    const data = (await res.json()) as { id?: string }
    return `Visualization saved. Students will see it in the shared panel (id: ${data.id ?? 'unknown'}). Continue teaching.`
  },
})

const setTopic = llm.tool({
  description:
    'Call at the start of a new main topic or when the learner shifts subjects. Use a concise 3–8 word title-cased phrase.',
  parameters: z.object({
    topic: z.string().describe('Topic title, e.g. How Photosynthesis Works'),
  }),
  execute: async ({ topic }) => `Topic noted: ${topic}`,
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
        voice: (process.env.GEMINI_VOICE as 'Puck' | undefined) || 'Puck',
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
  cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }))
}
