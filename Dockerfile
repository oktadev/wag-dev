FROM node:22.23-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY app/package.json app/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY app app
RUN pnpm --filter @wag/app build

FROM node:22.23-alpine AS run
WORKDIR /repo
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /repo/app/.next/standalone ./
COPY --from=build /repo/app/.next/static app/.next/static
COPY --from=build /repo/app/public app/public
EXPOSE 3000
CMD ["node", "app/server.js"]
