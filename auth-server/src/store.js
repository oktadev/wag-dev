// Small key/value interface with two backends. Redis for anything shared or durable; memory for dev and tests.
import Redis from "ioredis";

export function createMemoryStore() {
  const m = new Map(); // key -> { v, exp }
  const live = (k) => { const e = m.get(k); if (!e) return undefined; if (e.exp && e.exp < Date.now()) { m.delete(k); return undefined; } return e; };
  const exp = (ttl) => (ttl ? Date.now() + ttl * 1000 : 0);
  const sweep = setInterval(() => { for (const k of m.keys()) live(k); }, 30_000);
  sweep.unref();
  return {
    kind: "memory",
    async get(k) { return live(k)?.v; },
    async set(k, v, ttl) { m.set(k, { v, exp: exp(ttl) }); },
    async del(k) { m.delete(k); },
    async incr(k, ttl) { const e = live(k); const n = (e?.v ?? 0) + 1; m.set(k, { v: n, exp: e?.exp ?? exp(ttl) }); return n; },
    async setIfAbsent(k, v, ttl) { if (live(k)) return false; m.set(k, { v, exp: exp(ttl) }); return true; },
    async push(k, v, max, ttl) { const e = live(k); const arr = e?.v ?? []; arr.push(v); while (arr.length > max) arr.shift(); m.set(k, { v: arr, exp: exp(ttl) }); },
    async list(k) { return [...(live(k)?.v ?? [])]; },
    async ping() { return true; },
    async close() { clearInterval(sweep); m.clear(); },
  };
}

export function createRedisStore(url) {
  const r = new Redis(url, { maxRetriesPerRequest: 2, enableReadyCheck: true, lazyConnect: false });
  r.on("error", () => {}); // surfaced through ping()/readiness, not as unhandled events
  const enc = JSON.stringify;
  const dec = (s) => (s == null ? undefined : JSON.parse(s));
  return {
    kind: "redis",
    async get(k) { return dec(await r.get(k)); },
    async set(k, v, ttl) { await (ttl ? r.set(k, enc(v), "EX", Math.max(1, Math.ceil(ttl))) : r.set(k, enc(v))); },
    async del(k) { await r.del(k); },
    async incr(k, ttl) { const n = await r.incr(k); if (n === 1 && ttl) await r.expire(k, ttl); return n; },
    async setIfAbsent(k, v, ttl) { return (await r.set(k, enc(v), "EX", Math.max(1, Math.ceil(ttl)), "NX")) === "OK"; },
    async push(k, v, max, ttl) { await r.multi().rpush(k, enc(v)).ltrim(k, -max, -1).expire(k, ttl).exec(); },
    async list(k) { return (await r.lrange(k, 0, -1)).map(dec); },
    async ping() { return (await r.ping()) === "PONG"; },
    async close() { await r.quit().catch(() => r.disconnect()); },
  };
}
