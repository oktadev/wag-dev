// Runs the store contract against a real Redis when REDIS_TEST_URL is set (CI sets it).
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore, createRedisStore } from "../src/store.js";
import { generateKeyPairSync } from "node:crypto";
import { boot } from "./helpers.js";

const url = process.env.REDIS_TEST_URL;
const stores = [["memory", () => createMemoryStore()], ...(url ? [["redis", () => createRedisStore(url)]] : [])];

for (const [name, make] of stores) {
  test(`store contract: ${name}`, async () => {
    const s = make(); const k = `t:${name}:${Math.random()}`;
    try {
      assert.equal(await s.get(k), undefined);
      await s.set(k, { a: 1 }, 30); assert.deepEqual(await s.get(k), { a: 1 });
      await s.del(k); assert.equal(await s.get(k), undefined);
      assert.equal(await s.setIfAbsent(`${k}:nx`, 1, 30), true);
      assert.equal(await s.setIfAbsent(`${k}:nx`, 1, 30), false);
      assert.equal(await s.incr(`${k}:n`, 30), 1); assert.equal(await s.incr(`${k}:n`, 30), 2);
      for (let i = 0; i < 5; i++) await s.push(`${k}:l`, { i }, 3, 30);
      assert.deepEqual((await s.list(`${k}:l`)).map((x) => x.i), [2, 3, 4]); // capped to the newest 3
      assert.equal(await s.ping(), true);
    } finally { await s.close(); }
  });
}

if (url) {
  test("two instances on one Redis share replay state, modes and logs", async () => {
    // Both instances share the same WIdP key, as a real deployment would (loaded from env).
    const env = { REDIS_URL: url, WIDP_PRIVATE_JWK: JSON.stringify(generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" })) };
    const x = await boot(env), y = await boot(env);
    const sid = `shared-${Date.now()}`;
    const h = { "x-wag-session": sid };
    try {
      await x.call("/config", { method: "POST", json: { rejectReplay: true }, headers: h });
      assert.equal((await (await y.call("/config", { headers: h })).json()).modes.rejectReplay, true); // mode set on x, seen on y
      const s = await (await x.call("/idp/sign", { method: "POST", json: {}, headers: h })).json();
      const form = { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: s.assertion, resource: "https://r.example" };
      assert.equal((await x.call("/token", { method: "POST", form, headers: h })).status, 200);
      const replay = await y.call("/token", { method: "POST", form, headers: h }); // replayed at the OTHER instance
      assert.equal(replay.status, 400);
      assert.match((await replay.json()).error_description, /already used/);
      const log = await (await y.call("/debug/traffic", { headers: h })).json(); // x's traffic visible at y
      assert.ok(log.some((e) => e.path === "/token" && e.status === 200));
    } finally { await x.close(); await y.close(); }
  });
}
