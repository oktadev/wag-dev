# syntax=docker/dockerfile:1
# Self-contained: builds from this directory alone (the Vercel service root), with its own lockfile.
FROM node:22.23-alpine AS deps
RUN corepack enable
WORKDIR /srv
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod --ignore-workspace

FROM node:22.23-alpine
ENV NODE_ENV=production
WORKDIR /srv
COPY --from=deps --chown=node:node /srv/node_modules ./node_modules
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node src ./src
USER node
# PORT is supplied by the platform (Vercel defaults to 80; the local stack sets 4100).
EXPOSE 4100
CMD ["node", "server.mjs"]
