# syntax=docker/dockerfile:1
# Two deployable images from one workspace: `auth-server` and `app` (the default, last stage).
ARG NODE=22.23-alpine

FROM node:${NODE} AS base
RUN corepack enable
WORKDIR /repo

# ---- auth server ----------------------------------------------------------
FROM base AS as-deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY app/package.json app/
COPY auth-server/package.json auth-server/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --filter @wag/auth-server --prod

FROM node:${NODE} AS auth-server
ENV NODE_ENV=production PORT=4100
WORKDIR /repo
COPY --from=as-deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=as-deps --chown=node:node /repo/auth-server/node_modules ./auth-server/node_modules
COPY --chown=node:node auth-server/package.json auth-server/server.mjs auth-server/
COPY --chown=node:node auth-server/src auth-server/src
USER node
EXPOSE 4100
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:4100/health || exit 1
CMD ["node", "auth-server/server.mjs"]

# ---- app ------------------------------------------------------------------
FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY app/package.json app/
COPY auth-server/package.json auth-server/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --filter @wag/app...
COPY app app
ENV DOCKER_BUILD=1 NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_AS_URL=http://localhost:4100
ENV NEXT_PUBLIC_AS_URL=${NEXT_PUBLIC_AS_URL}
RUN pnpm --filter @wag/app build

FROM node:${NODE} AS app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY --from=build --chown=node:node /repo/app/.next/standalone ./
COPY --from=build --chown=node:node /repo/app/.next/static app/.next/static
COPY --from=build --chown=node:node /repo/app/public app/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "app/server.js"]
