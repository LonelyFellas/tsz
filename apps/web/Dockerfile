# syntax=docker/dockerfile:1
# Build context MUST be the repo root (pnpm workspace needs the lockfile and all
# workspace packages). Build from the repo root with:
#   docker build -f apps/web/Dockerfile -t tsz-web .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
# China mirror for npm tarballs — big speed win on a mainland ECS. Override with
# --build-arg NPM_REGISTRY=https://registry.npmjs.org for the default registry.
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=$NPM_REGISTRY \
    NEXT_TELEMETRY_DISABLED=1

# ---- build stage: install all deps, build only @tsz/web ----
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @tsz/web build

# ---- runtime stage: standalone server only ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# standalone output (with outputFileTracingRoot=repo root) lays files out under
# apps/web/.next/standalone/<repo-relative paths>, so server.js ends up at
# apps/web/server.js and the pruned node_modules at the root.
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
