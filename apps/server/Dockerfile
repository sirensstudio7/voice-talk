# Render has no first-class Bun runtime, so the API ships as a container.
# Alpine keeps the image ~2x smaller than the Debian slim variant; sharp has
# musl builds and Bun ships an official alpine runtime.
FROM oven/bun:1.4.0-alpine

# Campaign text on photos is rasterised by sharp's librsvg. Without
# fontconfig + a font, the <text> element silently renders as empty space —
# this bit the Debian slim image too, not just alpine.
RUN apk add --no-cache fontconfig ttf-dejavu

WORKDIR /app

# Manifests first, so a dependency-only change reuses the install layer.
# Production only; Bun resolves @voicetalk/shared from its TypeScript source
# through the package's "bun" export condition, so the image needs no build
# step, and `--ignore-scripts` skips the shared package's `prepare: tsc`.
# Peer dependencies stay: Elysia imports @sinclair/typebox at runtime.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/

RUN bun install --frozen-lockfile --production --ignore-scripts

COPY apps/server apps/server
COPY packages/shared/src packages/shared/src
COPY supabase supabase

WORKDIR /app/apps/server

ENV NODE_ENV=production
EXPOSE 8000

# Bun runs the TypeScript entrypoint directly — there is no build output.
CMD ["bun", "src/index.ts"]
