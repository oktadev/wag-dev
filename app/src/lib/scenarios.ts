import type { SignRequest } from "./types";

export const DEFAULT_SIGN: SignRequest = {
  claims: { sub: "agent/7f3d9as3", nickname: "Database Migration helper", scope: "tickets:read comments:write", roles: ["databases-team"] },
  header: {},
  expiresIn: "5m",
  omit: [],
  badSignature: false,
  unregisteredKey: false,
};

export type Scenario = {
  id: string;
  title: string;
  blurb: string;
  /** Why the outcome matters, in terms a reader can connect to the draft. Shown in the scenario card. */
  why: string;
  expect: "accept" | "reject";
  clause: string;
  sign: Partial<SignRequest>;
  /** Run the token request twice with the same assertion (for replay). */
  twice?: boolean;
  /** Extra token-request fields. `resource: ""` omits the parameter. */
  token?: Record<string, string>;
  modes?: Record<string, boolean>;
};

export const SCENARIOS: Scenario[] = [
  { id: "happy", why: 'This is the point of WAG. The tracker never registered this agent; it decides from who vouches for it, your identity provider. New agents get access without anyone filing a ticket.', title: "Unseen Agent", expect: "accept", clause: "No per-Agent registration; client_id carries no meaning",
    blurb: "A brand-new Agent presents its first assertion. The AS has never seen it, and still issues a token.", sign: {} },
  { id: "typ", why: 'Your identity provider signs other JWTs for the same audience too, such as ID tokens. Requiring the type oauth-wag+jwt stops one of those from being replayed as a grant.', title: "Wrong typ", expect: "reject", clause: "AS MUST reject an assertion whose typ is not oauth-wag+jwt",
    blurb: "An ID token or other JWT signed by the same issuer must not be usable as a WAG.", sign: { header: { typ: "JWT" } } },
  { id: "issuer", why: "Trust is set up once per identity provider. A stranger gets nothing, and the error tells the tracker's admin, not the platform, what has to change.", title: "Untrusted issuer", expect: "reject", clause: "AS MUST reject an assertion that matches no registration",
    blurb: "A Workload Identity Provider nobody registered tries its luck.", sign: { claims: { iss: "https://evil.example" } } },
  { id: "signature", why: 'A grant is only as good as its signature. One flipped bit and the server must refuse it, whoever claims to have sent it.', title: "Tampered signature", expect: "reject", clause: "Verify only under keys of the matched registration",
    blurb: "One flipped bit in the signature.", sign: { badSignature: true } },
  { id: "key", why: 'Right issuer, wrong key. The server verifies only under keys it holds for that issuer, never keys carried inside the assertion, so a forger cannot bring their own.', title: "Unregistered key", expect: "reject", clause: "Never trust key material the registration does not hold",
    blurb: "Right issuer, right claims, but signed with a key the AS has not registered.", sign: { unregisteredKey: true } },
  { id: "aud", why: 'A grant names the server it is for. One addressed to another server must not work here, or a token stolen from one service could be spent at another.', title: "Wrong audience", expect: "reject", clause: "aud is the AS issuer identifier",
    blurb: "The assertion was addressed to a different Authorization Server.", sign: { claims: { aud: "https://other.example" } } },
  { id: "exp", why: 'A grant is a bearer credential, so it is short-lived. A stale one is worthless, which limits what a leaked copy can do.', title: "Expired", expect: "reject", clause: "exp REQUIRED; assertions SHOULD be short-lived",
    blurb: "A grant that outlived its lifetime.", sign: { expiresIn: "-1m" } },
  { id: "jti", why: 'Required claims make a grant identifiable. The jti in particular is what lets a server tell one grant from another, and notice a repeat.', title: "Missing jti", expect: "reject", clause: "iss, sub, aud, exp, iat, jti are REQUIRED",
    blurb: "A required claim is absent.", sign: { omit: ["jti"] } },
  { id: "replay", why: 'The draft leaves this open. With the mode on, the server remembers each jti and refuses a second use. Off, a copied grant keeps working until it expires.', title: "Replayed assertion", expect: "reject", clause: "Open issue: jti replay (assumption, mode on)", twice: true,
    blurb: "The same assertion is presented twice. The spec leaves this open, so this scenario turns on the replay mode.",
    sign: { claims: { jti: "replay-demo" } }, modes: { rejectReplay: true } },
  { id: "resource", why: "resource is only recommended, so a server may refuse a request without one (invalid_target). The mode shows what that looks like from the agent's side.", title: "No resource", expect: "reject", clause: "resource is RECOMMENDED (assumption, mode on)", token: { resource: "" },
    blurb: "The AS is configured to insist on a resource indicator.", sign: {}, modes: { requireResource: true } },
];
