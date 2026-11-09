import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { boot } from "./helpers.js";

const TOKEN = "t".repeat(40);
let t;
before(async () => { t = await boot({ INTERNAL_TOKEN: TOKEN }); });
after(async () => { await t.close(); });

test("internal endpoints require the bearer token", async () => {
  for (const [p, m] of [["/idp/sign", "POST"], ["/config", "GET"], ["/debug/traffic", "GET"], ["/debug/reset", "POST"]]) {
    assert.equal((await t.call(p, { method: m, json: m === "POST" ? {} : undefined })).status, 401, p);
    assert.equal((await t.call(p, { method: m, json: m === "POST" ? {} : undefined, headers: { authorization: "Bearer wrong" } })).status, 401, p);
    assert.notEqual((await t.call(p, { method: m, json: m === "POST" ? {} : undefined, headers: { authorization: `Bearer ${TOKEN}` } })).status, 401, p);
  }
});

test("the token endpoint stays open: that is the protocol under test", async () => {
  const r = await t.call("/token", { method: "POST", form: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: "x" } });
  assert.equal(r.status, 400);
});

test("health stays open", async () => assert.equal((await t.call("/health")).status, 200));
