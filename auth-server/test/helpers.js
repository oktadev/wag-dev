import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { loadKeys } from "../src/keys.js";
import { createMemoryStore, createRedisStore } from "../src/store.js";

export const GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

export async function boot(env = {}) {
  const config = loadConfig({ PORT: "0", ISSUER: "http://as.test", LOG_LEVEL: "error", ...env });
  const store = config.redisUrl ? createRedisStore(config.redisUrl) : createMemoryStore();
  const app = await createApp({ config, store, keys: await loadKeys(config) });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = (path, { method = "GET", json, form, headers = {} } = {}) =>
    fetch(base + path, {
      method, headers: { ...(json ? { "content-type": "application/json" } : {}), ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}), ...headers },
      body: json ? JSON.stringify(json) : form ? new URLSearchParams(form).toString() : undefined,
    });
  return { app, config, store, base, call, close: () => app.close() };
}

export async function signAndPost(t, signBody = {}, tokenExtra = {}, headers = {}) {
  const s = await (await t.call("/idp/sign", { method: "POST", json: signBody, headers })).json();
  const r = await t.call("/token", { method: "POST", form: { grant_type: GRANT, assertion: s.assertion, resource: "https://tickets.saas.example", ...tokenExtra }, headers });
  return { signed: s, res: r, body: await r.json() };
}
