# InsyteAI — Voice-First AI Visual Learning Platform

A voice-first learning environment where complex ideas turn into live, interactive visualizations in real time. Built with **Google Gemini**, the **Agent Development Kit (ADK)**, and **Vertex AI** for the [Gemini Live Agent Challenge](https://cloud.google.com/blog/topics/training-certifications/join-the-gemini-live-agent-challenge/).

---

## ✨ What It Does

1. **Start a voice session** — speak naturally about any topic
2. **AI generates live visualizations** — React components, p5.js sketches, or Three.js scenes appear in real time as you talk
3. **Iterate by talking** — ask follow-up questions and watch the visuals update instantly

The entire experience is powered by Gemini's Live API streaming audio bidirectionally while ADK agents generate interactive educational content on the fly.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────┐
│                  Browser (Client)                 │
│  ┌────────────┐     ┌──────────────────────────┐ │
│  │  Microphone │◄───►│  WebSocket (voice-stream) │ │
│  │  + Visuals  │     │  Gemini Live API          │ │
│  └────────────┘     └────────────┬─────────────┘ │
│                                  │ tool calls     │
│                      ┌───────────▼─────────────┐ │
│                      │  ADK FunctionTool        │ │
│                      │  display_visual_aid      │ │
│                      │  → /api/genai/visualize  │ │
│                      │  → ADK Visualization     │ │
│                      │    Agent (gemini-3.1)     │ │
│                      └─────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ or [Bun](https://bun.sh)
- A [Google Gemini API key](https://aistudio.google.com/apikey)

### Setup

```bash
# Clone the repo
git clone https://github.com/theonlyamos/insyteai.git
cd insyteai

# Install dependencies
npm install   # or: pnpm install / bun install

# Configure environment
cp .env.example .env.local
# Edit .env.local and add your GEMINI_API_KEY

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the app boots directly into the live tutoring experience.

---

## 🔑 Environment Variables

| Variable | Required | Default | Description |
|:---|:---|:---|:---|
| `GEMINI_API_KEY` | **Yes**\* | — | Your Google Gemini API key |
| `GEMINI_PROJECT_ID` | No | — | GCP project ID (enables Vertex AI) |
| `GEMINI_LOCATION` | No | `us-central1` | Vertex AI region |
| `GEMINI_MODEL` | No | `gemini-3.1-flash-lite-preview` | Override the default model |

\*Not required if using Vertex AI (`GEMINI_PROJECT_ID` is set and you're authenticated via `gcloud auth application-default login`).

See [`.env.example`](.env.example) for a ready-to-copy template.

---

## 🧠 Tech Stack

| Layer | Technology |
|:---|:---|
| **Framework** | Next.js 16 (App Router) |
| **AI Models** | Gemini 2.5 Flash, Gemini 3.1 Flash Lite, Gemini Live 2.5 Flash Preview |
| **AI SDK** | `@google/genai` (Gen AI SDK) |
| **Agent Framework** | `@google/adk` (Agent Development Kit) |
| **Cloud Services** | Google Cloud Vertex AI, Cloud Run |
| **Voice** | Gemini Live API (bidirectional WebSocket streaming) |
| **Rendering** | React, p5.js, Three.js (sandboxed) |
| **UI** | shadcn/ui, Tailwind CSS |

---

## 📁 Project Structure (Lean)

```
src/
├── app/
│   ├── page.tsx                          # Root → InteractiveAITutor
│   ├── layout.tsx                        # Minimal layout (no auth)
│   └── api/
│       ├── agents/
│       │   ├── content/route.ts          # ADK Content Agent
│       │   ├── tutor/route.ts            # ADK Tutor Orchestrator
│       │   └── visualize/route.ts        # ADK Visualization Agent
│       ├── genai/
│       │   ├── ephemeral/route.ts        # Ephemeral token endpoint
│       │   └── visualize/route.ts        # Visualization (→ ADK agent)
│       └── students/illustrator/
│           ├── route.ts                  # Illustrator API
│           ├── voice/route.ts            # Voice processing
│           └── voice-stream/route.ts     # WebSocket Live API
├── components/
│   ├── learn/InteractiveAITutor.tsx      # Core UI component
│   ├── voice/VoiceControl.tsx            # Audio streaming control
│   └── lessons/ReactRenderer.tsx         # Sandboxed React renderer
└── lib/agents/
    ├── agent-config.ts                   # Shared Gemini/Vertex AI config
    ├── visualization-agent.ts            # ADK Visualization Agent
    ├── content-agent.ts                  # ADK Content Agent
    ├── tutor-agent.ts                    # ADK Tutor Orchestrator
    ├── live-tutor-agent.ts              # Live API FunctionTool bridge
    └── tools/                           # ADK tool definitions
```

---

## ☁️ Deployment (Cloud Run)

A production-ready Dockerfile and deployment script are included:

```bash
# Deploy to Google Cloud Run
./scripts/deploy-cloudrun.sh
```

The script maps all required environment variables automatically.

---

## 📜 License

MIT — see [LICENSE](LICENSE).
