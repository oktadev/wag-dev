import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./helpers.js";

test("requests over the per-minute limit get 429", async () => {
  const t = await boot({ RATE_LIMIT_PER_MIN: "5" });
  try {
    const codes = [];
    for (let i = 0; i < 9; i++) codes.push((await t.call("/.well-known/oauth-authorization-server")).status);
    assert.ok(codes.includes(429), codes.join());
    assert.equal((await t.call("/health")).status, 200); // probes are never throttled
  } finally { await t.close(); }
});
