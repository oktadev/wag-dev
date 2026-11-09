import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { boot, GRANT } from "./helpers.js";

let t;
before(async () => { t = await boot(); });
after(async () => { await t.close(); });

test("health and readiness", async () => {
  assert.equal((await t.call("/health")).status, 200);
  const r = await t.call("/ready");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, store: "memory" });
});

test("metadata advertises only what the server does", async () => {
  const m = await (await t.call("/.well-known/oauth-authorization-server")).json();
  assert.deepEqual(m.grant_types_supported, [GRANT]);
  assert.deepEqual(m.authorization_grant_profiles_supported, ["urn:ietf:params:oauth:grant-profile:wag"]);
  assert.equal(m.issuer, "http://as.test");
  assert.equal(m.response_types_supported.length, 0);
});

test("JWKS is served and holds no private material", async () => {
  const j = await (await t.call("/jwks")).json();
  assert.ok(j.keys.length > 0);
  for (const k of j.keys) for (const p of ["d", "p", "q", "dp", "dq", "qi"]) assert.equal(k[p], undefined);
});

test("unknown routes are 404, including provider routes we do not offer", async () => {
  for (const p of ["/auth", "/me", "/session/end", "/reg", "/token/introspection", "/nope"]) assert.equal((await t.call(p)).status, 404, p);
});

test("an unsupported grant type is rejected", async () => {
  const r = await t.call("/token", { method: "POST", form: { grant_type: "client_credentials" } });
  assert.equal(r.status, 400);
});

test("oversized bodies are refused", async () => {
  const r = await t.call("/idp/sign", { method: "POST", json: { claims: { pad: "x".repeat(40_000) } } }).catch((e) => e);
  assert.ok(r instanceof Error || r.status === 413);
});

test("sign validates its input", async () => {
  for (const bad of [{ expiresIn: "soon" }, { omit: ["nope"] }, { surprise: 1 }, { header: { alg: "none" } }]) {
    const r = await t.call("/idp/sign", { method: "POST", json: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal((await r.json()).error, "invalid_request");
  }
  assert.equal((await t.call("/idp/sign", { method: "POST", json: undefined, headers: { "content-type": "application/json" } })).status, 200);
});

test("error responses never leak internals", async () => {
  const r = await t.call("/idp/sign", { method: "POST", json: { expiresIn: "bad" } });
  const text = await r.text();
  assert.doesNotMatch(text, /at .*\.js:\d+|node_modules|stack/i);
});

test("security headers on JSON responses", async () => {
  const r = await t.call("/health");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("cache-control"), "no-store");
});
