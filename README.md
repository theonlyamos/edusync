# EduSync — AI-Powered Educational Platform

EduSync is an AI-powered educational platform for three roles — **admins**, **teachers**, and **students** — built on Next.js 16 (App Router) and Supabase. It provides AI content generation, a real-time AI study tutor (text and Gemini Live voice), live classes with an AI co-teacher agent (LiveKit), interactive code/visualization sandboxes, and an embeddable tutor widget with API-key based billing.

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript (strict) |
| Styling/UI | Tailwind CSS 3, shadcn/ui (vendored in `src/components/ui`), Radix, lucide-react |
| Database & Auth | Supabase (Postgres + Auth + RLS); schema in `supabase/migrations/` |
| AI | Google Gemini (`@google/genai`, primary — incl. Gemini Live voice), OpenAI SDK (fallback provider) |
| Live classes | LiveKit (rooms, tokens, webhooks) + agent worker in `agents/live-class-agent` |
| Payments | Stripe (credit purchases via webhook) |
| Charts/3D/Editor | Recharts, three.js, Monaco editor |
| Package manager | **pnpm** (workspace: root + `agents/live-class-agent`) |
| Tests | Vitest (`pnpm test`) |

## Architecture

```
Browser ─► src/proxy.ts            Next.js 16 middleware (renamed from middleware.ts):
           │                       security headers, CORS, rate limiting, API authn,
           │                       role-gated page redirects, /api/admin role gate
           ▼
   src/app/**                      pages + ~83 API route handlers (App Router)
           ▼
   src/lib/**                      auth, supabase clients, credits, api-key auth,
           │                       AI providers, zod validation
           ▼
   Supabase Postgres (RLS)         supabase/migrations/*.sql is the source of truth
   Stripe · LiveKit · Gemini       external services

agents/live-class-agent/           separate pnpm workspace package: LiveKit agent that
                                   joins live-class rooms as a Gemini Live co-teacher
```

Key behaviors worth knowing:
- **Auth**: Supabase Auth sessions for users; `isk_*` API keys (`embed_api_keys` table) for embedded widget consumers. `src/lib/auth-middleware.ts` maps API paths to required auth modes; unknown API paths default to session auth.
- **Credits**: 1 credit = 1 minute of AI session. Balance lives on `users.credits`; all mutations go through atomic SQL functions (`deduct_user_credits` / `add_user_credits`, migration 0032) that write the `credit_transactions` ledger in the same transaction.
- **Embeds**: `/embed/[id]` pages are intentionally embeddable anywhere (`frame-ancestors *`); embed API routes authenticate via API key, with per-key domain whitelists and hourly/daily rate limits.
- **Sandbox**: AI-generated interactive components render inside an opaque-origin iframe (`sandbox="allow-scripts"`, no `allow-same-origin`) — see `src/components/lessons/ReactRenderer.tsx`.

## Getting Started

```bash
pnpm install
cp .env.example .env.local   # fill in values (see comments in .env.example)
pnpm dev                     # http://localhost:3000
```

Supabase setup: create a project, then apply everything in `supabase/migrations/` in order (Supabase SQL editor or `supabase db push`).

Optional: `pnpm seed` creates demo users, grades, timetables, and assessments (requires service-role key in env).

### Portals
- Admin: `/admin/dashboard` — user/assessment/timetable management, analytics
- Teacher: `/teachers/dashboard` — lesson management, AI content generation
- Student: `/students/...` — lessons, practice, AI tutor (`/learn/[id]` for live sessions)
- Demo embed: `/demo` (requires `NEXT_PUBLIC_DEMO_EMBED_API_KEY`)

## Development

```bash
pnpm dev          # dev server
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run (unit tests live in src/**/__tests__)
pnpm build        # production build
```

CI (GitHub Actions, `.github/workflows/ci.yml`) runs typecheck + tests on pushes and PRs; the production build job is advisory until build-time env handling is finalized. ESLint is not yet configured (`next lint` was removed in Next 16).

### Live-class agent worker

The agent in `agents/live-class-agent` is deployed separately (LiveKit Cloud or self-hosted worker). See `agents/README.md` and `docs/live-class-spike.md`. It calls back into the app via `/api/live-classes/agent/*` routes authenticated with `LIVE_CLASS_AGENT_SECRET`.

## Deployment

Target is serverless (e.g. Vercel): `pnpm build` / `pnpm start`. Strict rate limits, Stripe webhook idempotency, and API-key rate limiting are backed by Postgres tables (migration 0032) so they hold across serverless instances. Set all variables from `.env.example` in your hosting environment.

## License

MIT
