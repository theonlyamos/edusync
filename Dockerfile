# Container for the live-class co-teacher (agents/live-class-agent), built by
# LiveKit Cloud. The Next.js app deploys on Vercel and does not use this file.
#
# Deploy from the repo root (so the shared package is in the build context):
#   lk agent deploy
# .dockerignore keeps the upload to the agent, the shared package and the
# workspace files.

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS base

# Without CA certificates Room.connect() fails with "failed to retrieve region info".
RUN apt-get update -qq && apt-get install --no-install-recommends -y ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY agents/live-class-agent/package.json agents/live-class-agent/package.json
RUN pnpm install --frozen-lockfile --prod --filter live-class-agent...

COPY packages/shared packages/shared
COPY agents/live-class-agent agents/live-class-agent

ENV NODE_ENV=production
RUN useradd --uid 10001 --create-home appuser && chown -R appuser /app
USER appuser

WORKDIR /app/agents/live-class-agent
CMD ["pnpm", "start"]
