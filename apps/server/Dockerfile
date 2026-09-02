# Render has no first-class Bun runtime, so the API ships as a container.
FROM oven/bun:1.4-slim

WORKDIR /app

# Workspace manifests first, so a dependency-only change reuses the layer.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/

RUN bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/server apps/server
COPY supabase supabase

WORKDIR /app/apps/server

ENV NODE_ENV=production
EXPOSE 8000

# Bun runs the TypeScript entrypoint directly — there is no build output.
CMD ["bun", "src/index.ts"]
