# WAG developer playground

Goal: a developer playground to test the Workload Authorization Grant (WAG) spec.

Source of truth: https://github.com/pcarleton/draft-carleton-workload-authz-grant
(pinned in `knowledge/SOURCE.md`). The spec text wins over anything in this repo.
If this repo's knowledge disagrees with upstream, upstream is right: fix the knowledge.

## Layout
pnpm monorepo. `app` = playground UI (Next.js + AI Elements). `auth-server` = WAG authorization server (node-oidc-provider + custom jwt-bearer handler) with a mock WIdP at `POST /idp/sign`; the app calls it server-side (`AS_URL`). `docker compose up --build` runs both (app :3000, AS :4100); `pnpm dev` runs both locally.

Deploy: `vercel.json` defines two Vercel services (app public, auth-server private container). Production state lives in Redis; see `.env.example` and `knowledge/memory/playground-notes.md`.

## Knowledge layout
- `knowledge/memory/` – durable prose context (spec summary, decisions, open issues, playground notes)
- `knowledge/graph/graph.json` – knowledge graph (nodes + edges) of spec concepts; `graph.mmd` is a Mermaid view
- `knowledge/SOURCE.md` – upstream commit the knowledge was derived from

## Rules
- Read `knowledge/memory/` before designing playground behaviour.
- Tag each playground behaviour as normative (MUST/SHOULD from the draft) or an assumption.
  Do not present open-issue behaviour (PoP, jti replay, agent ownership) as spec.
- When upstream changes: update `SOURCE.md`, then memory, then graph, in the same commit.
- Graph node ids are stable; add nodes, don't rename them.
