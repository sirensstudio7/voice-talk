# Ships as a container so any OCI-capable host (VM, Fly.io, Railway, Cloud
# Run, Kubernetes, Coolify…) can serve the API.
FROM oven/bun:1.4.0-alpine

# Campaign text on photos is rasterised by sharp's librsvg. Without
# fontconfig + a font, the <text> element silently renders as empty space —
# this bit the Debian slim image too, not just alpine. Only the regular and
# bold faces are kept; the other style files are never referenced.
RUN apk add --no-cache fontconfig ttf-dejavu \
 && find /usr/share/fonts/dejavu -type f ! -name 'DejaVuSans.ttf' ! -name 'DejaVuSans-Bold.ttf' -delete

WORKDIR /app

# Manifests first, so a dependency-only change reuses the install layer.
# Production only; Bun resolves @voicetalk/shared from its TypeScript source
# through the package's "bun" export condition, so the image needs no build
# step, and `--ignore-scripts` skips the shared package's `prepare: tsc`.
# Peer dependencies stay (Elysia imports @sinclair/typebox, exact-mirror and
# file-type at runtime), but type-only packages have no runtime code and are
# removed in the same layer. On alpine the glibc builds of libvips are dead
# weight — sharp loads the musl variants.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/

RUN bun install --frozen-lockfile --production --ignore-scripts --no-cache \
 && rm -rf /root/.bun/install/cache \
           node_modules/typescript node_modules/bun-types node_modules/@types \
           node_modules/@img/sharp-linux-* node_modules/@img/sharp-libvips-linux-*

COPY apps/server apps/server
COPY packages/shared/src packages/shared/src
COPY db db

WORKDIR /app/apps/server

ENV NODE_ENV=production
EXPOSE 8000

# Bun runs the TypeScript entrypoint directly — there is no build output.
CMD ["bun", "src/index.ts"]
