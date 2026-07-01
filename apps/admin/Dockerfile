# syntax=docker/dockerfile:1
# Build context MUST be the repo root (pnpm workspace needs the lockfile and all
# workspace packages). Build from the repo root with:
#   docker build -f apps/admin/Dockerfile -t tsz-admin .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
# China mirror for npm tarballs — big speed win on a mainland ECS. Override with
# --build-arg NPM_REGISTRY=https://registry.npmjs.org for the default registry.
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=$NPM_REGISTRY

# ---- build stage: install all deps, build only @tsz/admin (Vite → static dist) ----
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
# Persist turbo's cache across builds so a rebuild after a small change is fast.
RUN --mount=type=cache,id=turbo,target=/app/.turbo \
    pnpm --filter @tsz/admin build

# ---- runtime stage: nginx serving the static SPA on :3001 ----
# admin 是纯客户端 SPA，无需 Node 运行时；用 nginx 托管静态产物即可。
# 用 nginx-unprivileged 变体：容器以非 root（uid 101）运行 master+worker，pid/temp/cache
# 路径已预置为该用户可写，与 apps/web 的非 root 约定一致。监听 3001（>1024）非特权端口，
# 无需 root 即可绑定。静态文件与 conf 由 COPY 以 root 写入、对 nginx 用户只读，足够。
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
COPY apps/admin/deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html
EXPOSE 3001
