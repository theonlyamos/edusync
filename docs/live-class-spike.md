# Live class — Phase 0 spike checklist

Run this **before** relying on multi-participant → Gemini behavior in production.

## Prerequisites

1. [LiveKit Cloud](https://cloud.livekit.io) project: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
2. `GOOGLE_API_KEY` with Gemini Live enabled (same as app).
3. Clone [agent-starter-node](https://github.com/livekit-examples/agent-starter-node) or [agent-starter-react](https://github.com/livekit-examples/agent-starter-react) and connect to your Cloud project.

## Spike steps

1. Two browser tabs join the **same room** (use playground or this app’s dev join page once Phase 2 is merged).
2. Confirm each tab hears the other’s microphone (SFU path only).
3. Start the **Gemini Live** agent in that room ([Gemini plugin](https://docs.livekit.io/agents/models/realtime/plugins/gemini/)).
4. With **2–3 humans** speaking (overlapping or sequential), verify whether **`AgentSession` + `RealtimeModel`** feeds acceptable audio into Gemini (transcription quality, turn-taking, no constant interruption).

## Outcomes

- **Pass**: proceed with default agent audio config.
- **Fail / marginal**: plan custom mixing, stricter turn-taking, or headphones-only policy; document in PR.

This repo’s **`agents/`** package is the deployable worker; local run: see `agents/README.md`.
