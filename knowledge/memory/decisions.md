# Key decisions (condensed from upstream decision-log.md @85437ec)

| ID | Decision | Why |
|---|---|---|
| D3 | RFC 7523 authorization grant, not token exchange or client credentials | jwt-bearer is implemented by every mainstream AS; client-credentials would force sub == client_id |
| D4 | Client identity unspecified; unauthenticated is the floor | Keeps door open for platform-as-client (CIMD + private_key_jwt) |
| D8 | Multi-issuer scoping normative: keys per issuer, sub/jti only within `iss` | AS indexing by `sub` alone lets tenant B inherit tenant A's mapping |
| D10 | Retirement = Platform stops signing; residual access bounded by assertion + access-token lifetime | No ecosystem precedent for revocation signalling |
| D11 | On-behalf-of out of scope | Keeps document exploratory; agent-as-actor composition left to later work |
| D12 | Name: Workload Authorization Grant (WAG) | Names the artifact, parallels ID-JAG, avoids "federation" and agent-only framing |
| D13 | Standalone, not a profile of AIMS | Implementers shouldn't need a second draft |
| D14 | Five-editor group | See CONTRIBUTING: issues for proposals, editors write normative text |
| D16 | Explicit typing `oauth-wag+jwt` plus token-type URI | RFC 8725 3.11: prevent confusion with ID tokens / ID-JAGs |
| D17 | Advertise via `authorization_grant_profiles_supported` | jwt-bearer alone doesn't distinguish WAG; ID-JAG becomes a normative reference |

Superseded or withdrawn: D1, D2 (JIF naming), D6 (aud carries both values; now issuer id required, endpoint optional), D7 (URI-form Agent ID), D5 (IdP projection may be JIT; not in current draft). D15 is a placeholder upstream.
