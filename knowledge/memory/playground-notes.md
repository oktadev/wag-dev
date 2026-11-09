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
- Monorepo (pnpm workspace: `app`, `packages/*`). UI app is `app` (`@wag/app`): Next.js 16.4.5, React 19.3, Tailwind 4.3, shadcn init, pnpm. `.nvmrc` pins Node 22.23 (the shell default is 22.1). The build failure I first blamed on Node 22.1 was actually Workaround 1; I did not test whether 22.1 works with it.
- UI kit: **AI Elements (Vercel)**, installed with `pnpm dlx shadcn@latest add -y @ai-elements/<name>`. The `ai-elements` CLI mis-parses `-y` as a component name, so avoid it.
  Installed: conversation, message, tool, reasoning, plan, task, confirmation, terminal, code-block, schema-display, stack-trace, test-results, chain-of-thought.
- AI Elements is deprecated end of Nov 2026 (moving into shadcn/ui). Components are copied into `app/src/components/ai-elements/`, so we own them.
- Workaround 1: `magic-string@1.4.5` is ESM-only and breaks Tailwind's Turbopack plugin; pinned to 0.30.21 via `overrides` in root `pnpm-workspace.yaml`. Revisit when Tailwind fixes it.
- Workaround 2: `plan.tsx` `PlanTrigger` had a type error; props spread moved from `Button` to `CollapsibleTrigger`. Re-apply if the component is re-added.
- `app/AGENTS.md` says this Next.js has breaking changes: read `node_modules/next/dist/docs/` before writing Next code.
- Layout has `TooltipProvider` and forces the `dark` class.
