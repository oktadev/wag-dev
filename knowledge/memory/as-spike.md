# AS spike: node-oidc-provider 9.13.3 as the playground AS (2026-11-09)

Spike code was promoted to `auth-server/server.mjs` and the spike directory removed.

## Result: viable
A WAG token request with NO `client_id` and no client auth gets a 200 and a signed JWT access token.

## How
- `registerGrantType("urn:ietf:params:oauth:grant-type:jwt-bearer", handler, ["assertion","scope","resource"], ["resource"])`. Every custom param, incl. `resource`, must be registered.
- The provider authenticates the client before the handler runs, and its client lookup needs a `client_id` (params, Basic header, or client assertion). Workaround: a thin HTTP wrapper injects a placeholder public client (`token_endpoint_auth_method: none`) when the request has none. The placeholder has no meaning, matching the draft ("`client_id` has no meaning").
- Handler does the WAG checks (typ, one matching registration, signature under that registration's keys, aud = AS issuer, required claims) and issues via `provider.AccessToken`, with helpers from `oidc-provider/lib/helpers/grants.js`.
- Access tokens come out as JWTs via `resourceIndicators` with `accessTokenFormat: "jwt"`; `sub` was set to `<iss>|<sub>` (scopes the Agent to its WIdP).

## Verified
valid -> 200; wrong `typ`, untrusted `iss`, wrong `aud` -> 400 `invalid_grant` with `error_description` naming who must act.

## Gotchas
- Throw `errors.CustomOIDCProviderError("invalid_grant", msg)` to get a custom `error_description`; `errors.InvalidGrant(msg)` replaces it with "grant request is invalid".
- `grants.js` helpers are NOT semver-covered: pin `oidc-provider` exactly. The docs show `(provider, ctx, ...)` and that is what works on 9.13.3, although the installed `oidc-provider` handler code passes helpers without `provider`.
- The wrapper pre-parses the body, which logs a warning ("already parsed request body"). Works, but a Koa/Express middleware mounted in front would be cleaner.
- Provider metadata lists `jwt-bearer` in `grant_types_supported` but not the WAG grant-profile URN, and exposes implicit/authorization_code/refresh_token. Needs trimming plus a custom `authorization_grant_profiles_supported`.
- Dev defaults in use (in-memory adapter, dev signing keys, devInteractions): replace for anything shared.

## Not yet tested
`jti` replay store (the draft's replay question; the library says the app must supply an atomic store), DPoP binding via `validateDpop`/`setThumbprint`, tenant-claim matching, refresh-token suppression (none issued here, but not asserted), scope subset logic, `resource` required-mode, key rotation via `jwks_uri`.

## Fallback
If the wrapper becomes awkward: a small custom AS on `jose` + Hono (token, metadata, JWKS only).

## Status
Promoted to `auth-server/` (2026-11-09), wired to `app` via Docker Compose.
