# WAG spec summary (draft-carleton-workload-authz-grant, @85437ec)

Individual I-D, category info. Editors: Carleton (Anthropic), Steele (OpenAI), Parecki (Okta), Schwenkschuster (Defakto), Campbell (Ping).

## Purpose
A workload (motivating case: AI agent) gets an access token from a third-party OAuth AS with no per-workload provisioning. The AS is configured once to trust a Workload Identity Provider (WIdP). Unseen `sub` values are accepted.

## Roles
- Platform: creates and manages Agents.
- WIdP: part of the Platform; signs WAGs.
- Agent: the workload; the *subject* of the grant, not the OAuth client.
- AS / RS: standard OAuth roles. Multi-tenant deployments: each tenant partition is a separate AS/WIdP.

## Flow
1. Once: AS admin creates a WIdP registration (issuer, keys, optional tenant claim). Not an RFC 7591 client registration; yields no client_id.
2. Per Agent: Platform assigns an opaque, immutable Agent Identifier. Nothing sent to AS/RS.
3. Per access: Agent gets a WAG from the WIdP and POSTs to the AS token endpoint.

## Token request
- `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`, `assertion=<WAG>`, `resource=<RS>` (RECOMMENDED, RFC 8707; AS MAY reject missing with `invalid_target`).
- No client authentication required; `client_id` has no meaning. AS MUST NOT require per-Agent client registration.
- AS MUST NOT issue refresh tokens. Assertions SHOULD be short-lived; access tokens SHOULD NOT outlive the assertion by a significant period.

## WAG JWT
- Header `typ` MUST be `oauth-wag+jwt`; AS MUST reject others.
- Claims: `iss` (https issuer id, no query/fragment), `sub` (Agent ID), `aud` (AS issuer id, single value; AS MUST accept issuer id, MAY accept token endpoint URL), `exp`, `iat`, `jti` (all REQUIRED).
- `scope` OPTIONAL (AS may grant a subset). `nickname` OPTIONAL, display only, <=64 chars, MUST NOT drive authorization. Other claims allowed.

## AS verification rules
- Match assertion to exactly one registration: `iss` simple-string-equal, plus tenant claim/value if registered. At most one registration may match.
- Reject if no match. Verify signature only with keys configured/retrieved for the matched issuer, never keys in the assertion (RFC 8725 3.8, 3.10).
- Interpret `sub` and `jti` only within the matched registration. Key records on (WIdP, `sub`), never `sub` alone.
- Key sources: inline JWKS, JWKS URL, or `jwks_uri` from RFC 8414/OIDC metadata (metadata `issuer` must equal registered issuer). WIdP SHOULD publish a URL so keys rotate without admin action.

## Permissions
AS sets local policy per registration; may map WIdP claims (e.g. `roles`) to permissions, never `nickname`. Claim names and semantics are out of scope and meaningful only within one WIdP.

## Multi-tenancy
Dedicated issuer per tenant is RECOMMENDED. Else a differentiating claim named in the registration; `tenant` (ID-JAG) recommended.

## Errors
`invalid_grant` for untrusted WIdP or invalid assertion; `invalid_scope` / `invalid_target` for refused scope/resource, else `invalid_grant`. `error_description` SHOULD say who must act (AS admin vs Platform); `error_uri` SHOULD link a remedy.

## Discovery
AS SHOULD list `urn:ietf:params:oauth:grant-profile:wag` in `authorization_grant_profiles_supported` (ID-JAG parameter) and MUST then list jwt-bearer in `grant_types_supported`. Listing means "accepts unseen Agents".

## IANA
Media type `oauth-wag+jwt`; URNs `urn:ietf:params:oauth:token-type:wag` (for RFC 8693 issuance) and `urn:ietf:params:oauth:grant-profile:wag`.

## Out of scope
On-behalf-of / delegation (only a gesture at the actor role), how trust in a WIdP is established, what a workload may do, how an Agent obtains a WAG.
