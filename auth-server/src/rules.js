// The WAG draft's verification rules, in the order the token endpoint walks them.
// Pure data + one verifier, so the same list drives the check trace, the tests and the UI.
import { compactVerify } from "jose";

export class SpecError extends Error {} // a rule failed (client's fault). Anything else is a server fault.

export const ALGS = ["ES256", "ES384", "RS256", "PS256", "EdDSA"];

export const DEFS = [
  { id: "assertion", label: "Assertion present", clause: "Workload Authorization Grant: assertion parameter", actor: "Agent", action: "send the WAG in the assertion parameter" },
  { id: "typ", label: "typ is oauth-wag+jwt", clause: "JWT Syntax: typ MUST be oauth-wag+jwt", actor: "Platform", action: "reissue the assertion with typ oauth-wag+jwt" },
  { id: "registration", label: "Matches exactly one WIdP registration", clause: "Issuer Keys: reject an assertion that matches no registration", actor: "AS admin", action: "register the Workload Identity Provider" },
  { id: "signature", label: "Signature verifies under the registered keys", clause: "Issuer Keys: verify only under keys of the matched registration", actor: "Platform", action: "sign with a key the registration trusts" },
  { id: "aud", label: "aud names this Authorization Server", clause: "JWT Syntax: aud is the AS issuer identifier", actor: "Platform", action: "address the assertion to this Authorization Server" },
  { id: "exp", label: "Not expired", clause: "JWT Syntax: exp REQUIRED; assertions SHOULD be short-lived", actor: "Platform", action: "issue a fresh assertion" },
  { id: "claims", label: "Required claims present (sub, jti)", clause: "JWT Syntax: iss, sub, aud, exp, iat, jti REQUIRED", actor: "Platform", action: "include every required claim" },
  { id: "replay", label: "jti not seen before", clause: "Open Issues: Replay (assumption, mode)", actor: "Platform", action: "issue a new assertion with a fresh jti", mode: "rejectReplay" },
  { id: "resource", label: "resource indicator present", clause: "Workload Authorization Grant: resource is RECOMMENDED (mode)", actor: "Agent", action: "send the resource parameter", error: "invalid_target", mode: "requireResource" },
];

export const MODE_INFO = [
  { key: "rejectReplay", label: "Reject replayed jti", status: "open issue",
    description: "The draft leaves open whether the AS MUST reject a jti it has already accepted. When on, a second use of the same assertion is refused." },
  { key: "acceptTokenEndpointAud", label: "Accept token endpoint URL as aud", status: "optional in draft",
    description: "The AS MUST accept its issuer identifier as aud and MAY also accept its token endpoint URL." },
  { key: "requireResource", label: "Require resource parameter", status: "optional in draft",
    description: "resource is RECOMMENDED; an AS MAY refuse a request that lacks it with invalid_target." },
];
export const DEFAULT_MODES = Object.freeze({ rejectReplay: false, acceptTokenEndpointAud: false, requireResource: false });

const b64json = (part) => JSON.parse(Buffer.from(part, "base64url").toString());

/**
 * Walk the rules for one assertion. Never throws SpecError: it returns { ok, payload, checks, error }.
 * Infrastructure failures (store down) propagate, so they surface as 5xx and are never reported as a spec rejection.
 */
export async function verifyWag({ assertion, resource, modes, issuer, registrations, store, sid, now = Date.now() }) {
  const done = new Map();
  const stop = (id, message) => { throw new SpecError(message); };
  let failedId;
  const step = async (id, fn) => {
    const def = DEFS.find((d) => d.id === id);
    if (def.mode && !modes[def.mode]) { done.set(id, { status: "off", detail: `mode "${def.mode}" is off` }); return undefined; }
    try {
      const out = await fn();
      done.set(id, { status: "pass" });
      return out;
    } catch (e) {
      if (!(e instanceof SpecError)) throw e;
      done.set(id, { status: "fail", detail: e.message, actor: def.actor });
      failedId = id;
      throw e;
    }
  };
  const result = () => ({ checks: DEFS.map((d) => ({ id: d.id, label: d.label, clause: d.clause, actor: d.actor, ...(done.get(d.id) ?? { status: "skipped" }) })) });

  try {
    await step("assertion", () => { if (!assertion) stop("assertion", "missing assertion"); });
    const claims = await step("typ", () => {
      let header, claims;
      try { const [h, p] = String(assertion).split("."); header = b64json(h); claims = b64json(p); } catch { stop("typ", "assertion is not a JWT"); }
      if (header?.typ !== "oauth-wag+jwt") stop("typ", `typ is ${JSON.stringify(header?.typ)}, must be "oauth-wag+jwt"`);
      return claims;
    });
    const reg = await step("registration", () => {
      const m = registrations.filter((r) => r.issuer === claims.iss);
      if (m.length !== 1) stop("registration", `issuer ${JSON.stringify(claims.iss)} matches ${m.length} registrations, need exactly 1`);
      return m[0];
    });
    const payload = await step("signature", async () => {
      try { return JSON.parse(new TextDecoder().decode((await compactVerify(assertion, reg.keys, { algorithms: ALGS })).payload)); }
      catch (e) { stop("signature", `signature check failed (${e.code ?? e.name})`); }
    });
    await step("aud", () => {
      const ok = [issuer, ...(modes.acceptTokenEndpointAud ? [`${issuer}/token`] : [])];
      if (typeof payload.aud !== "string" || !ok.includes(payload.aud)) stop("aud", `aud ${JSON.stringify(payload.aud)} is not ${ok.join(" or ")}`);
    });
    await step("exp", () => {
      if (typeof payload.exp !== "number") stop("exp", "exp is missing");
      const left = payload.exp - Math.floor(now / 1000);
      if (left <= 0) stop("exp", `expired ${-left}s ago`);
    });
    await step("claims", () => {
      const missing = ["sub", "iat", "jti"].filter((c) => payload[c] === undefined);
      if (missing.length) stop("claims", `missing required claim ${missing.join(", ")}`);
    });
    await step("replay", async () => {
      const ttl = Math.max(1, payload.exp - Math.floor(now / 1000));
      const first = await store.setIfAbsent(`jti:${sid}:${payload.iss}|${payload.jti}`, 1, ttl); // atomic: concurrent replays can't both pass
      if (!first) stop("replay", `jti ${payload.jti} was already used`);
    });
    await step("resource", () => { if (!resource) stop("resource", "no resource parameter"); });
    return { ok: true, payload, ...result() };
  } catch (e) {
    if (!(e instanceof SpecError)) throw e;
    const def = DEFS.find((d) => d.id === failedId);
    return { ok: false, failedId, error: def.error ?? "invalid_grant", description: `${e.message}. ${def.actor}: ${def.action}.`, ...result() };
  }
}
