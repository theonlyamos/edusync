/**
 * Shared ADK agent configuration.
 *
 * Reads GEMINI_API_KEY (or GOOGLE_GENAI_API_KEY) and the preferred model from
 * environment variables and exposes helpers that every agent can reuse.
 */

import { Gemini, InMemorySessionService, Runner, type BaseAgent } from '@google/adk';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const MODEL_NAME = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite-preview';

/**
 * Returns a pre-configured `Gemini` LLM instance.
 *
 * The API key is resolved automatically from `GEMINI_API_KEY` /
 * `GOOGLE_GENAI_API_KEY` env vars by the ADK Gemini class.
 */
export function getModel(): Gemini {
    const useVertex = !!process.env.GEMINI_PROJECT_ID;
    return new Gemini(useVertex ? {
        model: MODEL_NAME,
        vertexai: true,
        project: process.env.GEMINI_PROJECT_ID,
        location: process.env.GEMINI_LOCATION || 'us-central1'
    } : {
        model: MODEL_NAME,
        apiKey: process.env.GEMINI_API_KEY,
    });
}

// ---------------------------------------------------------------------------
// Session service  (in-memory is fine for stateless API routes)
// ---------------------------------------------------------------------------

export function getSessionService() {
    return new InMemorySessionService();
}

// ---------------------------------------------------------------------------
// Runner factory
// ---------------------------------------------------------------------------

export function createRunner(agent: BaseAgent, appName = 'edusync') {
    return new Runner({
        appName,
        agent,
        sessionService: getSessionService(),
    });
}

// ---------------------------------------------------------------------------
// Constants re-exported for convenience
// ---------------------------------------------------------------------------

export { MODEL_NAME };
