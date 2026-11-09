import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "./helpers.js";

const TOKEN = "p".repeat(40);
const heavy = (t, headers = {}) => t.call("/idp/sign", { method: "POST", json: {}, headers: { authorization: `Bearer ${TOKEN}`, ...headers } });
const codes = async (n, fn) => { const out = []; for (let i = 0; i < n; i++) out.push((await fn(i)).status); return out; };

test("signing and token issuance have a tighter per-IP limit than other routes", async () => {
  const t = await boot({ INTERNAL_TOKEN: TOKEN, HEAVY_RATE_LIMIT_PER_MIN: "4", RATE_LIMIT_PER_MIN: "50" });
  try {
    const c = await codes(8, () => heavy(t));
    assert.deepEqual(c.slice(0, 4), [200, 200, 200, 200]);
    assert.ok(c.slice(4).every((x) => x === 429), c.join());
    assert.equal((await t.call("/.well-known/oauth-authorization-server")).status, 200); // light routes unaffected
    const r = await heavy(t);
    assert.equal(r.headers.get("retry-after"), "30");
  } finally { await t.close(); }
});

test("a spoofed client IP is ignored without the proxy secret", async () => {
  const t = await boot({ INTERNAL_TOKEN: TOKEN, HEAVY_RATE_LIMIT_PER_MIN: "3" });
  try {
    const c = await codes(8, (i) => heavy(t, { "x-wag-client-ip": `10.0.0.${i + 1}` })); // different "IP" each time
    assert.ok(c.includes(429), `rotating a forged header must not escape the limit: ${c.join()}`);
  } finally { await t.close(); }
});

test("the app can forward real visitor IPs, each with its own bucket", async () => {
  const t = await boot({ INTERNAL_TOKEN: TOKEN, HEAVY_RATE_LIMIT_PER_MIN: "2" });
  const as = (ip) => heavy(t, { "x-wag-client-ip": ip, "x-wag-proxy-token": TOKEN });
  try {
    assert.deepEqual(await codes(3, () => as("198.51.100.1")), [200, 200, 429]); // visitor A exhausted
    assert.equal((await as("198.51.100.2")).status, 200); // visitor B unaffected
    assert.equal((await as("2001:db8::7")).status, 200); // IPv6 accepted
  } finally { await t.close(); }
});

test("a malformed forwarded IP falls back to the socket peer instead of becoming a bucket key", async () => {
  const t = await boot({ INTERNAL_TOKEN: TOKEN, HEAVY_RATE_LIMIT_PER_MIN: "2" });
  try {
    const c = await codes(5, (i) => heavy(t, { "x-wag-client-ip": `evil key ${i}\n`, "x-wag-proxy-token": TOKEN }));
    assert.ok(c.includes(429), c.join());
  } finally { await t.close(); }
});

test("the global daily budget stops everyone, however many addresses they use", async () => {
  const t = await boot({ INTERNAL_TOKEN: TOKEN, DAILY_BUDGET: "5", HEAVY_RATE_LIMIT_PER_MIN: "100" });
  const as = (i) => heavy(t, { "x-wag-client-ip": `203.0.113.${i + 1}`, "x-wag-proxy-token": TOKEN });
  try {
    const c = await codes(8, as); // a fresh address every time
    assert.equal(c.filter((x) => x === 200).length, 5, c.join());
    const r = await as(99);
    assert.equal(r.status, 429);
    assert.equal((await r.json()).error, "budget_exhausted");
    assert.equal((await t.call("/health")).status, 200); // the server itself stays up
  } finally { await t.close(); }
});

test("requests refused by the per-IP limit do not spend the shared budget", async () => {
  const t = await boot({ INTERNAL_TOKEN: TOKEN, DAILY_BUDGET: "3", HEAVY_RATE_LIMIT_PER_MIN: "1" });
  try {
    await codes(20, () => heavy(t, { "x-wag-client-ip": "192.0.2.1", "x-wag-proxy-token": TOKEN })); // one abuser hammers
    assert.equal((await heavy(t, { "x-wag-client-ip": "192.0.2.50", "x-wag-proxy-token": TOKEN })).status, 200); // a bystander still gets in
  } finally { await t.close(); }
});
