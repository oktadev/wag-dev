import Redis from "ioredis";
import { boot } from "../test/helpers.js";
const r = new Redis("redis://127.0.0.1:6392");
// Measures Redis growth when an abuser opens a brand-new session on every request. Not part of the test suite.
const t = await boot({ REDIS_URL: "redis://127.0.0.1:6392", INTERNAL_TOKEN: "q".repeat(40) });
const H = { authorization: `Bearer ${"q".repeat(40)}` };
const used = async () => Number((await r.info("memory")).match(/used_memory:(\d+)/)[1]);
await r.flushall(); const base = await used();
const N = 300;
for (let i = 0; i < N; i++) {
  const h = { ...H, "x-wag-session": `abuser-${String(i).padStart(6, "0")}` }; // a brand-new visitor every time
  const s = await (await t.call("/idp/sign", { method: "POST", json: { claims: { pad: "x".repeat(3000), scope: "tickets:read comments:write" } }, headers: h })).json();
  await t.call("/token", { method: "POST", form: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: s.assertion, resource: "https://r.example" }, headers: h });
}
const grown = (await used()) - base;
const keys = await r.dbsize();
console.log(`requests (sign+token pairs): ${N} | keys: ${keys} | memory growth: ${(grown / 1024).toFixed(0)} KB | per pair: ${(grown / N / 1024).toFixed(1)} KB`);
console.log(`=> at DAILY_BUDGET=5000 (2500 pairs) worst case ~ ${(grown / N * 2500 / 1048576).toFixed(0)} MB, all expiring within the hour; dataset limit is 125 MB`);
const ttls = await Promise.all((await r.keys("*")).slice(0, 400).map((k) => r.ttl(k)));
console.log("keys with no expiry:", ttls.filter((x) => x === -1).length);
await t.close(); r.disconnect();
