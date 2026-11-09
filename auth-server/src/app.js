// The HTTP surface. Only the routes listed here are reachable; everything else is a 404 before it can touch the provider.
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, createLocalJWKSet } from "jose";
import Provider, { errors } from "oidc-provider";
import * as grants from "oidc-provider/lib/helpers/grants.js";
import { z } from "zod";
import { makeAdapter } from "./adapter.js";
import { log } from "./log.js";
import { DEFAULT_MODES, MODE_INFO, verifyWag } from "./rules.js";

const JWT_BEARER = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const WAG_PROFILE = "urn:ietf:params:oauth:grant-profile:wag";
const WAG_CLIENT = "wag-anonymous"; // placeholder public client; the draft gives client_id no meaning
const SID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const SESSION_TTL = 60 * 60; // an hour of playground state per visitor
const LOG_MAX = 100;

const SignBody = z.object({
  claims: z.record(z.string().max(64), z.unknown()).default({}),
  header: z.object({ typ: z.string().max(64).optional(), kid: z.string().max(64).optional() }).strict().default({}),
  expiresIn: z.string().regex(/^-?\d{1,6}[smhd]$/).default("5m"),
  omit: z.array(z.enum(["jti", "sub", "exp", "iat", "iss", "aud"])).max(6).default([]),
  badSignature: z.boolean().default(false),
  unregisteredKey: z.boolean().default(false),
}).strict();
const ConfigBody = z.object({ rejectReplay: z.boolean(), acceptTokenEndpointAud: z.boolean(), requireResource: z.boolean() }).partial().strict();

class HttpError extends Error { constructor(status, code, message, headers = {}) { super(message); this.status = status; this.code = code; this.headers = headers; } }
const secs = (s) => { const m = /^(-?\d+)([smhd])$/.exec(s); return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2]]; };
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const clip = (t, n = 6000) => (t.length > n ? `${t.slice(0, n)}…[truncated]` : t);

export async function createApp({ config, store, keys }) {
  const registrations = [{ issuer: config.widpIssuer, keys: createLocalJWKSet({ keys: [keys.widpJwk] }) }];
  const entries = new WeakMap(); // request -> traffic entry, so the grant handler can attach its trace

  const sessionOf = (req) => {
    const v = req.headers["x-wag-session"];
    return typeof v === "string" && SID_RE.test(v) ? v : "shared";
  };
  const getModes = async (sid) => ({ ...DEFAULT_MODES, ...((await store.get(`modes:${sid}`)) ?? {}) });

  const provider = new Provider(config.issuer, {
    adapter: makeAdapter(store),
    clients: [{ client_id: WAG_CLIENT, token_endpoint_auth_method: "none", grant_types: [JWT_BEARER], redirect_uris: [], response_types: [] }],
    jwks: keys.providerJwks,
    cookies: { keys: config.cookieKeys ?? ["dev-only-cookie-key-not-for-production"] },
    features: {
      devInteractions: { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => config.resource,
        getResourceServerInfo: () => ({ scope: "tickets:read comments:write", accessTokenFormat: "jwt", audience: config.resource, accessTokenTTL: 300 }),
      },
    },
    ttl: { AccessToken: 300 },
  });
  if (config.trustProxy) provider.proxy = true;

  provider.registerGrantType(JWT_BEARER, async (ctx) => {
    const entry = entries.get(ctx.req);
    const sid = sessionOf(ctx.req);
    const modes = await getModes(sid);
    const v = await verifyWag({
      assertion: ctx.oidc.params.assertion, resource: ctx.oidc.params.resource,
      modes, issuer: config.issuer, registrations, store, sid,
    }).catch((e) => { throw e; }); // infrastructure faults propagate and become 5xx, never a spec rejection
    if (entry) entry.checks = v.checks;
    if (!v.ok) throw new errors.CustomOIDCProviderError(v.error, v.description);

    const { payload } = v;
    const scopes = [...grants.validateClientScope(provider, ctx, (typeof payload.scope === "string" ? payload.scope : "").split(" ").filter(Boolean))];
    const resourceServers = await grants.resolveRequestedResources(provider, ctx);
    const token = new provider.AccessToken({ client: ctx.oidc.client, gty: "jwt-bearer", accountId: `${payload.iss}|${payload.sub}` }); // scoped to (WIdP, sub)
    token.scope = scopes.join(" ") || undefined;
    if (resourceServers[0]) token.resourceServer = resourceServers[0];
    ctx.oidc.entity("AccessToken", token);
    const value = await token.save();
    ctx.body = grants.buildTokenResponse(provider, { accessToken: value, tokenType: token.tokenType, expiresIn: token.expiration, scope: token.scope });
  }, ["assertion", "scope", "resource"], ["resource"]);

  // RFC 8414 metadata we author ourselves: the provider's own document advertises flows this server does not offer.
  const metadata = {
    issuer: config.issuer,
    token_endpoint: `${config.issuer}/token`,
    jwks_uri: `${config.issuer}/jwks`,
    grant_types_supported: [JWT_BEARER],
    authorization_grant_profiles_supported: [WAG_PROFILE],
    token_endpoint_auth_methods_supported: ["none"],
    response_types_supported: [],
  };

  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", (d) => { n += d.length; if (n > config.maxBodyBytes) { reject(new HttpError(413, "payload_too_large", "request body too large")); req.destroy(); } else chunks.push(d); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
  const parseJson = async (req, schema) => {
    let raw; try { raw = JSON.parse((await readBody(req)) || "{}"); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, "invalid_request", "body is not valid JSON"); }
    const r = schema.safeParse(raw);
    if (!r.success) throw new HttpError(400, "invalid_request", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
    return r.data;
  };
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers });
    res.end(JSON.stringify(body));
  };
  const needInternal = (req) => {
    const h = req.headers.authorization ?? "";
    const ok = config.internalToken ? h.startsWith("Bearer ") && same(h.slice(7), config.internalToken) : !config.production;
    if (!ok) throw new HttpError(401, "unauthorized", "internal endpoint: missing or invalid bearer token");
  };

  // Mock WIdP. Options let the playground build assertions that are deliberately wrong.
  async function sign(o) {
    const now = Math.floor(Date.now() / 1000);
    const payload = { sub: "agent/7f3d9as3", scope: "tickets:read comments:write", ...o.claims };
    payload.iss ??= config.widpIssuer; payload.aud ??= config.issuer; payload.iat ??= now; payload.exp ??= now + secs(o.expiresIn); payload.jti ??= crypto.randomUUID();
    for (const k of o.omit) delete payload[k];
    const header = { typ: "oauth-wag+jwt", alg: "ES256", kid: keys.widpJwk.kid, ...o.header };
    let assertion = await new SignJWT(payload).setProtectedHeader(header).sign(o.unregisteredKey ? keys.stranger : keys.widpPrivate);
    if (o.badSignature) { const i = assertion.lastIndexOf(".") + 1; assertion = assertion.slice(0, i) + (assertion[i] === "A" ? "B" : "A") + assertion.slice(i + 1); }
    return { header, claims: payload, assertion };
  }

  // Traffic log, per visitor session, in the shared store. The entry is persisted BEFORE the response is flushed,
  // so a caller that reads x-wag-trace and immediately asks for the entry always finds it.
  function record(req, res, sid, path) {
    const t0 = Date.now();
    const entry = { at: new Date().toISOString(), method: req.method, path, headers: {} };
    for (const h of ["content-type", "content-length", "user-agent", "accept"]) if (req.headers[h]) entry.headers[h] = req.headers[h];
    entries.set(req, entry);
    const chunks = [];
    const w = res.write.bind(res), e = res.end.bind(res);
    res.write = (c, ...a) => { if (c && typeof c !== "function") chunks.push(Buffer.from(c)); return w(c, ...a); };
    res.end = (c, ...a) => {
      if (c && typeof c !== "function") chunks.push(Buffer.from(c));
      Object.assign(entry, { status: res.statusCode, ms: Date.now() - t0, responseBody: redact(clip(Buffer.concat(chunks).toString())) });
      store.push(`log:${sid}`, entry, LOG_MAX, SESSION_TTL).catch((err) => log("warn", "log write failed", { err: String(err.message) })).finally(() => e(c, ...a));
      return res;
    };
    return entry;
  }
  // Access tokens are bearer credentials: keep them out of the stored log, keep their claims readable.
  const redact = (t) => t.replace(/("access_token":")([^"]{12})[^"]*(")/g, "$1$2…[redacted]$3");

  async function allocId(sid) { return store.incr(`seq:${sid}`, SESSION_TTL); }
  const provCb = provider.callback();

  const IP_RE = /^[0-9a-fA-F:.]{3,45}$/;
  /** The visitor's address. Behind the app the socket peer is always the app, so the app forwards the real one;
   *  that header is believed ONLY when it arrives with the shared secret. Anyone else cannot choose their bucket. */
  function callerIp(req) {
    const fwd = req.headers["x-wag-client-ip"], proof = req.headers["x-wag-proxy-token"];
    if (config.internalToken && typeof proof === "string" && same(proof, config.internalToken) && typeof fwd === "string" && IP_RE.test(fwd)) return fwd;
    if (config.trustProxy) { const x = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim(); if (IP_RE.test(x)) return x; }
    return req.socket.remoteAddress || "unknown";
  }
  /** A short one-way tag of the caller address, so abuse can be told apart in logs without storing raw IPs. */
  const ipTag = (req) => createHash("sha256").update(callerIp(req)).digest("hex").slice(0, 8);
  /** Per-IP limits (light for everything, tighter for the endpoints that sign/issue) plus one global daily budget
   *  that bounds total work and Redis growth no matter how many addresses an abuser has. */
  async function rateLimit(req, heavy) {
    const ip = callerIp(req), minute = Math.floor(Date.now() / 60000);
    const n = await store.incr(`rl:${heavy ? "h" : "l"}:${ip}:${minute}`, 120);
    if (n > (heavy ? config.heavyPerMin : config.rateLimitPerMin)) throw new HttpError(429, "rate_limited", "too many requests, slow down", { "retry-after": "30" });
    if (heavy) {
      const day = new Date().toISOString().slice(0, 10);
      if ((await store.incr(`budget:${day}`, 90000)) > config.dailyBudget) throw new HttpError(429, "budget_exhausted", "the demo's daily request budget is used up; try again tomorrow", { "retry-after": "3600" });
    }
  }

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const path = (req.url ?? "/").split("?")[0];
    const sid = sessionOf(req);
    let status = 500;
    res.on("finish", () => { status = res.statusCode; });
    try {
      if (path === "/health") return send(res, 200, { ok: true });
      if (path === "/ready") {
        const ok = await store.ping().catch(() => false);
        return send(res, ok ? 200 : 503, { ok, store: store.kind });
      }
      await rateLimit(req, req.method === "POST" && (path === "/token" || path === "/idp/sign"));

      if (path === "/.well-known/oauth-authorization-server" || path === "/.well-known/openid-configuration") return send(res, 200, metadata);

      if (path === "/idp/sign" && req.method === "POST") {
        needInternal(req);
        const body = await parseJson(req, SignBody);
        const entry = record(req, res, sid, path); entry.id = await allocId(sid); entry.requestBody = JSON.stringify(body);
        res.setHeader("x-wag-trace", String(entry.id));
        return send(res, 200, await sign(body));
      }
      if (path === "/config") {
        needInternal(req);
        if (req.method === "POST") {
          const patch = await parseJson(req, ConfigBody);
          await store.set(`modes:${sid}`, { ...(await store.get(`modes:${sid}`) ?? {}), ...patch }, SESSION_TTL);
        } else if (req.method !== "GET") throw new HttpError(405, "method_not_allowed", "GET or POST");
        return send(res, 200, { modes: await getModes(sid), info: MODE_INFO });
      }
      if (path === "/debug/traffic" && req.method === "GET") { needInternal(req); return send(res, 200, await store.list(`log:${sid}`)); }
      if (path.startsWith("/debug/traffic/") && req.method === "GET") {
        needInternal(req);
        const id = Number(path.split("/").pop());
        const hit = (await store.list(`log:${sid}`)).find((e) => e.id === id);
        return send(res, 200, hit ?? null);
      }
      if (path === "/debug/reset" && req.method === "POST") {
        needInternal(req);
        await Promise.all([store.del(`log:${sid}`), store.del(`modes:${sid}`), store.del(`seq:${sid}`)]);
        return send(res, 200, { ok: true });
      }

      if (path === "/token" && req.method === "POST") {
        const raw = await readBody(req);
        const entry = record(req, res, sid, path);
        entry.id = await allocId(sid);
        entry.requestBody = redact(clip(raw));
        res.setHeader("x-wag-trace", String(entry.id));
        const p = new URLSearchParams(raw);
        if (!p.has("client_id") && !req.headers.authorization) { p.set("client_id", WAG_CLIENT); entry.note = "no client_id/auth in request: placeholder public client injected"; }
        req.body = Object.fromEntries(p);
        return provCb(req, res);
      }
      if (path === "/jwks" && req.method === "GET") return provCb(req, res);

      throw new HttpError(404, "not_found", "no such route");
    } catch (e) {
      const known = e instanceof HttpError;
      if (!known) log("error", "unhandled", { path, err: String(e?.message ?? e) });
      if (!res.headersSent) send(res, known ? e.status : 500, { error: known ? e.code : "server_error", error_description: known ? e.message : "internal error" }, known ? e.headers : {});
    } finally {
      res.on("close", () => log("info", "req", { method: req.method, path, status, ms: Date.now() - started, sid, ip: ipTag(req) }));
    }
  });
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = Math.min(config.requestTimeoutMs, 10000);
  server.keepAliveTimeout = 5000;

  return {
    server,
    async close() { await new Promise((r) => server.close(r)); await store.close(); },
  };
}
