import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { boot, signAndPost } from "./helpers.js";

let t;
before(async () => { t = await boot(); });
after(async () => { await t.close(); });

const failed = (body) => body.error_description;

test("an unseen Agent gets a token with no client_id and no refresh token", async () => {
  const { res, body, signed } = await signAndPost(t);
  assert.equal(res.status, 200);
  assert.equal(body.token_type, "Bearer");
  assert.equal(body.refresh_token, undefined);
  assert.equal(signed.header.typ, "oauth-wag+jwt");
  const claims = JSON.parse(Buffer.from(body.access_token.split(".")[1], "base64url"));
  assert.match(claims.sub, /acme\.agents\.platform\.example\|agent\/7f3d9as3/); // scoped to (WIdP, sub)
});

test("the trace names every rule and marks the first failure", async () => {
  const { res } = await signAndPost(t, { header: { typ: "JWT" } });
  assert.equal(res.status, 400);
  const e = await (await t.call(`/debug/traffic/${res.headers.get("x-wag-trace")}`)).json();
  const byId = Object.fromEntries(e.checks.map((c) => [c.id, c.status]));
  assert.equal(byId.assertion, "pass");
  assert.equal(byId.typ, "fail");
  assert.equal(byId.registration, "skipped");
});

const REJECTS = [
  ["wrong typ", { header: { typ: "JWT" } }, /typ is "JWT"/, "Platform"],
  ["untrusted issuer", { claims: { iss: "https://evil.example" } }, /matches 0 registrations/, "AS admin"],
  ["tampered signature", { badSignature: true }, /signature check failed/, "Platform"],
  ["unregistered key", { unregisteredKey: true }, /signature check failed/, "Platform"],
  ["wrong audience", { claims: { aud: "https://other.example" } }, /aud "https:\/\/other.example"/, "Platform"],
  ["expired", { expiresIn: "-1m" }, /expired \d+s ago/, "Platform"],
  ["missing jti", { omit: ["jti"] }, /missing required claim jti/, "Platform"],
  ["missing sub", { omit: ["sub"] }, /missing required claim sub/, "Platform"],
];
for (const [name, sign, re, actor] of REJECTS) {
  test(`rejects: ${name}`, async () => {
    const { res, body } = await signAndPost(t, sign);
    assert.equal(res.status, 400);
    assert.equal(body.error, "invalid_grant");
    assert.match(failed(body), re);
    assert.match(failed(body), new RegExp(`${actor}:`)); // says who must act
  });
}

test("a malformed assertion is a 400, not a 500", async () => {
  const r = await t.call("/token", { method: "POST", form: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: "not-a-jwt" } });
  assert.equal(r.status, 400);
});

test("replay is accepted by default and rejected when the mode is on", async () => {
  const sid = "session-replay-1";
  const h = { "x-wag-session": sid };
  const s = await (await t.call("/idp/sign", { method: "POST", json: {}, headers: h })).json();
  const post = () => t.call("/token", { method: "POST", headers: h, form: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: s.assertion, resource: "https://r.example" } });
  assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 200); // spec leaves this open: off by default
  await t.call("/config", { method: "POST", json: { rejectReplay: true }, headers: h });
  const s2 = await (await t.call("/idp/sign", { method: "POST", json: {}, headers: h })).json();
  const post2 = () => t.call("/token", { method: "POST", headers: h, form: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: s2.assertion, resource: "https://r.example" } });
  assert.equal((await post2()).status, 200);
  const again = await post2();
  assert.equal(again.status, 400);
  assert.match((await again.json()).error_description, /already used/);
});

test("concurrent replays: exactly one wins", async () => {
  const h = { "x-wag-session": "session-race-1" };
  await t.call("/config", { method: "POST", json: { rejectReplay: true }, headers: h });
  const s = await (await t.call("/idp/sign", { method: "POST", json: {}, headers: h })).json();
  const rs = await Promise.all(Array.from({ length: 8 }, () => t.call("/token", { method: "POST", headers: h, form: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: s.assertion, resource: "https://r.example" } })));
  const codes = rs.map((r) => r.status).sort();
  assert.equal(codes.filter((c) => c === 200).length, 1);
});

test("requireResource mode returns invalid_target", async () => {
  const h = { "x-wag-session": "session-resource-1" };
  await t.call("/config", { method: "POST", json: { requireResource: true }, headers: h });
  const s = await (await t.call("/idp/sign", { method: "POST", json: {}, headers: h })).json();
  const r = await t.call("/token", { method: "POST", headers: h, form: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: s.assertion } });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "invalid_target");
});

test("acceptTokenEndpointAud mode accepts the token endpoint URL as aud", async () => {
  const h = { "x-wag-session": "session-aud-1" };
  const send = async () => {
    const s = await (await t.call("/idp/sign", { method: "POST", json: { claims: { aud: "http://as.test/token" } }, headers: h })).json();
    return t.call("/token", { method: "POST", headers: h, form: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: s.assertion, resource: "https://r.example" } });
  };
  assert.equal((await send()).status, 400);
  await t.call("/config", { method: "POST", json: { acceptTokenEndpointAud: true }, headers: h });
  assert.equal((await send()).status, 200);
});

test("modes and logs are isolated per session", async () => {
  const a = { "x-wag-session": "session-iso-aaaa" }, b = { "x-wag-session": "session-iso-bbbb" };
  await t.call("/config", { method: "POST", json: { rejectReplay: true }, headers: a });
  assert.equal((await (await t.call("/config", { headers: b })).json()).modes.rejectReplay, false);
  await signAndPost(t, {}, {}, a);
  assert.equal((await (await t.call("/debug/traffic", { headers: b })).json()).length, 0);
  assert.ok((await (await t.call("/debug/traffic", { headers: a })).json()).length >= 2);
});

test("stored log entries redact access tokens", async () => {
  const h = { "x-wag-session": "session-redact-1" };
  await signAndPost(t, {}, {}, h);
  const log = await (await t.call("/debug/traffic", { headers: h })).json();
  const tok = log.find((e) => e.path === "/token");
  assert.match(tok.responseBody, /redacted/);
});
