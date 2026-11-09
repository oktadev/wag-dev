# Playground notes

Intent: let developers exercise the WAG spec end to end (WIdP issuing, AS verifying) and see why a request is accepted or rejected.

## Suggested conformance checks (each maps to a draft requirement)
- Accept: valid WAG from a registered issuer with a never-seen `sub` yields an access token.
- Reject: `typ` not `oauth-wag+jwt`; no matching registration; bad signature; key supplied via `jwk`/`jku`/`x5u` header; expired; `aud` not the AS issuer (or token endpoint if enabled); missing required claim.
- Reject: two registrations match one assertion (config error).
- Tenant claim: missing or wrong value does not match the registration.
- Same `sub` under two WIdPs yields distinct identities.
- `nickname` never used in the policy decision.
- No refresh token in the response; access-token lifetime not beyond assertion.
- Error shape: `invalid_grant` / `invalid_scope` / `invalid_target`, `error_description` names who must act.
- Metadata: grant-profile URN present implies jwt-bearer in `grant_types_supported`.

## Switchable, explicitly non-normative modes
`jti` replay rejection, token-endpoint-URL audience, `resource` required, DPoP / client-auth hardening. Label these as assumptions in the UI.

## Open design questions (for us, not upstream)
- Stack, and whether the playground ships both a mock WIdP and a mock AS.
- Whether it should also be usable as a conformance harness against a real AS.

## Build setup (done 2026-11-09)
- Monorepo (pnpm workspace: `app`, `auth-server`). UI app is `app` (`@wag/app`): Next.js 16.4.5, React 19.3, Tailwind 4.3, shadcn init, pnpm. `.nvmrc` pins Node 22.23 (the shell default is 22.1). The build failure I first blamed on Node 22.1 was actually Workaround 1; I did not test whether 22.1 works with it.
- UI kit: **AI Elements (Vercel)**, installed with `pnpm dlx shadcn@latest add -y @ai-elements/<name>`. The `ai-elements` CLI mis-parses `-y` as a component name, so avoid it.
  Installed: conversation, message, tool, reasoning, plan, task, confirmation, terminal, code-block, schema-display, stack-trace, test-results, chain-of-thought.
- AI Elements is deprecated end of Nov 2026 (moving into shadcn/ui). Components are copied into `app/src/components/ai-elements/`, so we own them.
- Workaround 1: `magic-string@1.4.5` is ESM-only and breaks Tailwind's Turbopack plugin; pinned to 0.30.21 via `overrides` in root `pnpm-workspace.yaml`. Revisit when Tailwind fixes it.
- Workaround 2: `plan.tsx` `PlanTrigger` had a type error; props spread moved from `Button` to `CollapsibleTrigger`. Re-apply if the component is re-added.
- `app/AGENTS.md` says this Next.js has breaking changes: read `node_modules/next/dist/docs/` before writing Next code.
- Layout has `TooltipProvider` and forces the `dark` class.

## Production hardening (2026-11-09)
- Auth server split into `auth-server/src/{config,store,keys,adapter,rules,app,log}.js`. `rules.js` is a pure verifier that drives both the spec check trace and the tests. Infrastructure faults are never reported as spec rejections.
- State lives in a store (`store.js`): Redis in production (tokens via the oidc-provider adapter, `jti` replay via atomic SET NX, modes, per-session log), memory for dev/tests. Production refuses to boot without Redis unless `ALLOW_MEMORY_STORE=1`.
- Config is validated at boot and lists every problem (`config.js`). Secrets: `pnpm --filter @wag/auth-server keys`.
- Internal endpoints (`/idp/sign`, `/config`, `/debug/*`) need `Authorization: Bearer $INTERNAL_TOKEN`. Only the Next.js server holds it. `/token` stays open (that is the protocol under test). Routes are an allow-list; unoffered provider routes 404.
- Per-visitor isolation: the app sets an httpOnly `wag_sid` cookie; the AS keys modes, replay state and log by it (`x-wag-session`).
- App: zod-validated route handlers, same-origin check, timeouts, safe error mapping, CSP and security headers. `output: standalone` only when `DOCKER_BUILD=1`.
- Tests: `pnpm test` (auth-server node:test, 35 tests; +2 with `REDIS_TEST_URL`; app vitest, 27). Mutation-checked: breaking `typ`, replay, signature, token leakage and cookie validation each fail tests.
- Removed 20 unused shadcn/AI Elements files; only `ai-elements/code-block` remains.
- Known gaps: CSP still allows `unsafe-inline` scripts (needs nonces); the Redis `StoreAdapter` implements what the grant path uses, not every oidc-provider model operation; no rate limit on the app's own routes (the AS limits per IP); per-instance mock WIdP key must be shared via env across instances.

## Abuse limits and plaintext Redis (2026-11-09)
- Decision: the demo runs on Redis WITHOUT TLS. The Vercel-provisioned Redis Cloud database serves plain `redis://` and its TLS toggle is not available to us on the Vercel settings page (Redis docs: TLS is a console setting, not on Free). Production boot therefore needs `ALLOW_INSECURE_REDIS=1` on the auth server. Risk accepted: the Redis password and stored access tokens cross the internet unencrypted. Revisit if the playground ever holds anything but synthetic data.
- Abuse bounds in `auth-server/src/app.js`: light per-IP limit (120/min) on every route; heavy per-IP limit (30/min) on `POST /token` and `POST /idp/sign`; one global `DAILY_BUDGET` (5000 heavy calls per UTC day) across all visitors; 16 KB body cap; log capped at 100 entries per session; every key has a TTL (sessions 1 hour).
- The visitor IP reaches the auth server only through the app: the app forwards `x-wag-client-ip` plus `x-wag-proxy-token` (= INTERNAL_TOKEN). The AS believes the IP only with that proof, so rotating a forged header cannot escape a limit. Vercel overwrites `x-forwarded-for`, so the app's source of the IP is not spoofable there.
- Measured with `auth-server/scripts/measure-redis-growth.mjs`: ~15.7 KB of Redis per sign+token pair even when every request uses a new session; the daily budget caps that near 38 MB, below the 125 MB dataset limit. The database uses `noeviction`, so hitting the limit would make writes fail rather than drop old data.
- Limits that hold only with Redis: with the in-memory store each instance counts alone.

## Deployed (2026-11-09)
- Live: https://wag-dev.vercel.app (Vercel project `okta-dev-advocacy/wag-dev`, no Git integration yet: deploy with `vercel deploy --prod --scope okta-dev-advocacy`, which uploads the working tree and ALWAYS targets production for this project so far).
- `vercel.json`: two services. `app` (Next.js, public) and `auth-server` (container). Only `/token`, `/jwks` and `/.well-known/oauth-authorization-server` are routed to the auth server; everything else, including `/idp/sign`, `/config`, `/debug/*`, `/health`, `/ready`, goes to the app and 404s. `auth-server/test/vercel-routes.test.js` fails if that changes. The app calls the AS over a service binding (`AS_URL`, injected by Vercel).
- Production env: REDIS_URL (Redis Cloud, PLAIN redis://, `ALLOW_INSECURE_REDIS=1`), ISSUER and NEXT_PUBLIC_AS_URL = https://wag-dev.vercel.app, NODE_ENV=production, TRUST_PROXY=1, plus sensitive WIDP_PRIVATE_JWK, PROVIDER_JWKS, COOKIE_KEYS, INTERNAL_TOKEN. Preview has its own generated secrets, ISSUER, and ALLOW_MEMORY_STORE=1 (no Redis).
- Gotcha: the first deploy crashed the AS because ISSUER was unset (production config check). Container stderr is visible in `vercel logs --json` (look for `Application exited with code 1` and the `listening` line). Container listens on PORT=80.
- Verified live: sign -> token 200 with all enabled rules passing; wrong typ -> 400 invalid_grant naming who must act; public POST /token works directly with curl; private routes 404; JWKS has no private fields; per-IP limit returned 429 after ~30 requests/min and recovered after a minute.
- Known: the IP rate limit works because TRUST_PROXY=1 reads x-forwarded-for, which Vercel overwrites. Visitors reaching /token directly are keyed by that; visitors via the app are keyed by the address the app forwards.
