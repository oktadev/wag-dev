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
  { id: "happy", title: "Unseen Agent", expect: "accept", clause: "No per-Agent registration; client_id carries no meaning",
    blurb: "A brand-new Agent presents its first assertion. The AS has never seen it, and still issues a token.", sign: {} },
  { id: "typ", title: "Wrong typ", expect: "reject", clause: "AS MUST reject an assertion whose typ is not oauth-wag+jwt",
    blurb: "An ID token or other JWT signed by the same issuer must not be usable as a WAG.", sign: { header: { typ: "JWT" } } },
  { id: "issuer", title: "Untrusted issuer", expect: "reject", clause: "AS MUST reject an assertion that matches no registration",
    blurb: "A Workload Identity Provider nobody registered tries its luck.", sign: { claims: { iss: "https://evil.example" } } },
  { id: "signature", title: "Tampered signature", expect: "reject", clause: "Verify only under keys of the matched registration",
    blurb: "One flipped bit in the signature.", sign: { badSignature: true } },
  { id: "key", title: "Unregistered key", expect: "reject", clause: "Never trust key material the registration does not hold",
    blurb: "Right issuer, right claims, but signed with a key the AS has not registered.", sign: { unregisteredKey: true } },
  { id: "aud", title: "Wrong audience", expect: "reject", clause: "aud is the AS issuer identifier",
    blurb: "The assertion was addressed to a different Authorization Server.", sign: { claims: { aud: "https://other.example" } } },
  { id: "exp", title: "Expired", expect: "reject", clause: "exp REQUIRED; assertions SHOULD be short-lived",
    blurb: "A grant that outlived its lifetime.", sign: { expiresIn: "-1m" } },
  { id: "jti", title: "Missing jti", expect: "reject", clause: "iss, sub, aud, exp, iat, jti are REQUIRED",
    blurb: "A required claim is absent.", sign: { omit: ["jti"] } },
  { id: "replay", title: "Replayed assertion", expect: "reject", clause: "Open issue: jti replay (assumption, mode on)", twice: true,
    blurb: "The same assertion is presented twice. The spec leaves this open, so this scenario turns on the replay mode.",
    sign: { claims: { jti: "replay-demo" } }, modes: { rejectReplay: true } },
  { id: "resource", title: "No resource", expect: "reject", clause: "resource is RECOMMENDED (assumption, mode on)", token: { resource: "" },
    blurb: "The AS is configured to insist on a resource indicator.", sign: {}, modes: { requireResource: true } },
];
