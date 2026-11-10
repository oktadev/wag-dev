# WAG Developer Playground

A pnpm monorepo for trying the [Workload Authorization Grant (WAG)](https://www.ietf.org/archive/id/draft-carleton-workload-authz-grant-02.txt) draft. It includes a Next.js playground app and a WAG authorization server with a mock Workload Identity Provider.

## Run locally

Requirements: Node.js 22.12 or later and pnpm 10.18.0.

Run the app and authorization server with pnpm:

```sh
pnpm install
pnpm dev
```

Or run the full stack, including Redis, with Docker:

```sh
docker compose up --build
```

Open the playground at [http://localhost:3000](http://localhost:3000). The authorization server listens on port 4100. Stop either option with `Ctrl+C`.
