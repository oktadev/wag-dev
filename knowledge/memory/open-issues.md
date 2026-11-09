# Open issues: do NOT present these as settled spec behaviour

## O1 / draft "Proof of possession"
The grant is a bearer assertion. Compositions (from upstream `notes/oauth-slots.md`):

| # | Composition | Protects | Cost |
|---|---|---|---|
| 1 | Grant only (bearer) | Nothing beyond TLS | Replay within lifetime; mitigate with jti cache + short exp |
| 2 | Grant + CIMD/private_key_jwt | AS knows the caller (platform) | Platform needs a client identity |
| 3 | Grant + attestation-based client auth | Stolen assertion useless without instance key | Instances hold keys; ATTEST draft immature |
| 4 | Grant + DPoP | Access token sender-constrained | RS must validate DPoP |
| 5 | Grant with `cnf` + matching DPoP at token endpoint | Binds assertion and token | Not off-the-shelf; needs profile text |

Upstream lean: floor = row 1 hardened (mandatory jti replay rejection, short lifetimes); row 3 or 5 where instances hold keys.

## Replay
Whether the AS MUST reject an already-seen `jti` while the assertion is valid, or stays optional as in RFC 7523 3.

## O4 Agent as grant-subject vs OAuth client
Expected flashpoint. Current design: subject. Challenge: agent should be the client (RFC 7523 2.2). Internal inconsistencies upstream admits: ID-JAG composition needs an authenticated client but the floor has none; no wire form for "grant my email to that agent"; AS has no caller identity to throttle or kill.

## Agent ownership
Upstream issue #13.

## Resolved or stale upstream
O2 (claim naming) and O3 (WIMSE/SPIFFE section) are listed in the decision log but the current draft no longer carries them.
