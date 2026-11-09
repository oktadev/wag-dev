import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined) }) }));

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let reply: (url: string, init: RequestInit) => Response | Promise<Response>;

beforeEach(() => {
  jar.clear(); calls = [];
  process.env.INTERNAL_TOKEN = "secret-internal-token";
  process.env.AS_URL = "http://as.internal";
  vi.resetModules();
  vi.stubGlobal("fetch", async (url: URL | string, init: RequestInit = {}) => { calls.push({ url: String(url), init }); return reply(String(url), init); });
});
afterEach(() => { vi.unstubAllGlobals(); });

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://app.test${path}`, { method: "POST", headers: { "content-type": "application/json", host: "app.test", ...headers }, body: JSON.stringify(body) });
const hdr = (c: Call) => (c.init.headers ?? {}) as Record<string, string>;

describe("POST /api/sign", () => {
  it("adds the internal token and the visitor session, and sets the session cookie", async () => {
    reply = () => Response.json({ header: {}, claims: {}, assertion: "x.y.z" });
    const { POST } = await import("@/app/api/sign/route");
    const res = await POST(post("/api/sign", {}));
    expect(res.status).toBe(200);
    expect(hdr(calls[0]).authorization).toBe("Bearer secret-internal-token");
    expect(hdr(calls[0])["x-wag-session"]).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(res.headers.get("set-cookie")).toMatch(/wag_sid=.+HttpOnly.+SameSite=Lax/);
  });
  it("never leaks the internal token into what the browser sees", async () => {
    reply = () => Response.json({ header: {}, claims: {}, assertion: "x.y.z" });
    const { POST } = await import("@/app/api/sign/route");
    const body = await (await POST(post("/api/sign", {}))).text();
    expect(body).not.toContain("secret-internal-token");
    expect(body.toLowerCase()).not.toContain("authorization: bearer");
  });
  it("reuses an existing valid session cookie and does not reissue it", async () => {
    jar.set("wag_sid", "abcdef123456");
    reply = () => Response.json({ header: {}, claims: {}, assertion: "a.b.c" });
    const { POST } = await import("@/app/api/sign/route");
    const res = await POST(post("/api/sign", {}));
    expect(hdr(calls[0])["x-wag-session"]).toBe("abcdef123456");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("replaces a malformed session cookie rather than forwarding it", async () => {
    jar.set("wag_sid", "bad value\r\nx-evil: 1");
    reply = () => Response.json({ assertion: "a.b.c" });
    const { POST } = await import("@/app/api/sign/route");
    await POST(post("/api/sign", {}));
    expect(hdr(calls[0])["x-wag-session"]).not.toContain("evil");
  });
  it("refuses cross-origin posts", async () => {
    const { POST } = await import("@/app/api/sign/route");
    const res = await POST(post("/api/sign", {}, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
  it("rejects invalid input before it reaches the auth server", async () => {
    const { POST } = await import("@/app/api/sign/route");
    const res = await POST(post("/api/sign", { expiresIn: "soon" }));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("maps an unreachable auth server to a safe 502", async () => {
    reply = () => { throw new TypeError("connect ECONNREFUSED 10.0.0.5:4100"); };
    const { POST } = await import("@/app/api/sign/route");
    const res = await POST(post("/api/sign", {}));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toMatch(/10\.0\.0\.5|ECONNREFUSED/);
  });
  it("maps a timeout to a distinct message", async () => {
    reply = () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; };
    const { POST } = await import("@/app/api/sign/route");
    const res = await POST(post("/api/sign", {}));
    expect((await res.json()).error).toMatch(/timed out/);
  });
});

describe("POST /api/token", () => {
  const body = { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: "a.b.c", resource: "https://r.example" };
  it("does NOT send the internal token on the public token endpoint", async () => {
    reply = (url) => url.endsWith("/token") ? Response.json({ access_token: "t" }, { headers: { "x-wag-trace": "7" } }) : Response.json({ checks: [] });
    const { POST } = await import("@/app/api/token/route");
    await POST(post("/api/token", body));
    const tokenCall = calls.find((c) => c.url.endsWith("/token"))!;
    expect(hdr(tokenCall).authorization).toBeUndefined();
  });
  it("returns the checks the auth server recorded, scoped to the session", async () => {
    reply = (url) => url.endsWith("/token")
      ? Response.json({ error: "invalid_grant" }, { status: 400, headers: { "x-wag-trace": "7" } })
      : Response.json({ checks: [{ id: "typ", status: "fail" }], note: "n" });
    const { POST } = await import("@/app/api/token/route");
    const out = await (await POST(post("/api/token", body))).json();
    expect(out.status).toBe(400);
    expect(out.checks[0].id).toBe("typ");
    const traceCall = calls.find((c) => c.url.includes("/debug/traffic/7"))!;
    expect(hdr(traceCall)["x-wag-session"]).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
  it("survives a non-JSON answer from the auth server", async () => {
    reply = () => new Response("<html>bad gateway</html>", { status: 502 });
    const { POST } = await import("@/app/api/token/route");
    const out = await (await POST(post("/api/token", body))).json();
    expect(out.status).toBe(502);
    expect(out.body.error).toBe("server_error");
  });
  it("refuses a grant type other than jwt-bearer", async () => {
    const { POST } = await import("@/app/api/token/route");
    expect((await POST(post("/api/token", { ...body, grant_type: "client_credentials" }))).status).toBe(400);
  });
});

describe("the browser-visible wire log", () => {
  it("omits credentials from the recorded request", async () => {
    reply = () => Response.json({ assertion: "a.b.c" });
    const { POST } = await import("@/app/api/sign/route");
    const out = await (await POST(post("/api/sign", {}))).json();
    expect(out.wire.request).not.toMatch(/authorization|bearer|secret-internal-token|x-wag-session/i);
  });
});

describe("client IP forwarding", () => {
  const ipOf = (c: Call) => hdr(c)["x-wag-client-ip"];
  it("forwards the platform-reported visitor IP with proof, to the signing endpoint", async () => {
    reply = () => Response.json({ assertion: "a.b.c" });
    const { POST } = await import("@/app/api/sign/route");
    await POST(post("/api/sign", {}, { "x-forwarded-for": "198.51.100.7, 10.0.0.1" }));
    expect(ipOf(calls[0])).toBe("198.51.100.7");
    expect(hdr(calls[0])["x-wag-proxy-token"]).toBe("secret-internal-token");
  });
  it("does not forward a malformed address", async () => {
    reply = () => Response.json({ assertion: "a.b.c" });
    const { POST } = await import("@/app/api/sign/route");
    await POST(post("/api/sign", {}, { "x-forwarded-for": "not an ip; x-evil: 1" }));
    expect(ipOf(calls[0])).toBeUndefined();
  });
  it("forwards it on the token request too, and never exposes it in the wire log", async () => {
    reply = (url) => url.endsWith("/token") ? Response.json({ access_token: "t" }, { headers: { "x-wag-trace": "1" } }) : Response.json({ checks: [] });
    const { POST } = await import("@/app/api/token/route");
    const out = await (await POST(post("/api/token", { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: "a.b.c" }, { "x-forwarded-for": "203.0.113.9" }))).json();
    expect(ipOf(calls.find((c) => c.url.endsWith("/token"))!)).toBe("203.0.113.9");
    expect(out.wire.request).not.toMatch(/203\.0\.113\.9|x-wag-proxy-token|secret-internal-token/);
  });
});
