import "server-only";
import { AS_URL, INTERNAL_TOKEN } from "./env";
import { sessionId, withSessionCookie } from "./session";
import type { Check, Wire } from "./types";

export { AS_URL };

const fmt = (h: Record<string, string>) => Object.entries(h).map(([k, v]) => `${k}: ${v}`).join("\n");
const TIMEOUT_MS = 10_000;

/** Request headers the browser-visible log may show. An allow-list, so a header added later is hidden by default.
 *  Credentials are added to `sent` only, after `shown` is built from the caller's headers. */
const SHOWN = new Set(["content-type", "accept"]);

type Opts = { internal?: boolean; sid: string; ip?: string };

/** One HTTP exchange with the auth server, recorded as raw HTTP text with credentials left out. */
export async function exchange(method: string, path: string, headers: Record<string, string>, body: string | undefined, o: Opts) {
  const url = new URL(path, AS_URL);
  const sent: Record<string, string> = { ...headers, "x-wag-session": o.sid };
  if (o.internal && INTERNAL_TOKEN) sent.authorization = `Bearer ${INTERNAL_TOKEN}`;
  // Tell the auth server which visitor this is, so its rate limits are per visitor and not per app instance.
  // The proof header is what makes the auth server believe it; it is never shown in the browser-visible log.
  if (o.ip && INTERNAL_TOKEN) { sent["x-wag-client-ip"] = o.ip; sent["x-wag-proxy-token"] = INTERNAL_TOKEN; }
  const shown = Object.fromEntries(Object.entries(sent).filter(([k]) => SHOWN.has(k.toLowerCase())));
  const t0 = Date.now();
  const r = await fetch(url, { method, headers: sent, body, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await r.text();
  const ms = Date.now() - t0;
  const reqHeaders = body === undefined ? shown : { ...shown, "content-length": String(Buffer.byteLength(body)) };
  const request = `${method} ${url.pathname} HTTP/1.1\nHost: ${url.host}\n${fmt(reqHeaders)}${body ? `\n\n${body}` : ""}`;
  const keep = Object.fromEntries([...r.headers].filter(([k]) => ["content-type", "cache-control"].includes(k)));
  const response = `HTTP/1.1 ${r.status} ${r.statusText}\n${fmt(keep)}\n\n${text}`;
  const wire: Wire = { request, response, ms, status: r.status };
  return { status: r.status, text, wire, trace: r.headers.get("x-wag-trace") };
}

export async function fetchChecks(traceId: string | null, sid: string): Promise<{ checks: Check[]; note?: string }> {
  if (!traceId) return { checks: [] };
  const r = await fetch(`${AS_URL}/debug/traffic/${encodeURIComponent(traceId)}`, {
    cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "x-wag-session": sid, ...(INTERNAL_TOKEN ? { authorization: `Bearer ${INTERNAL_TOKEN}` } : {}) },
  });
  const e = r.ok ? await r.json() : null;
  return { checks: e?.checks ?? [], note: e?.note };
}

/** Wrap a route handler: resolve the visitor session, map failures to safe JSON, and set the cookie. */
export function route(fn: (sid: string, req: Request, ip: string) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const { sid, fresh } = await sessionId();
    try {
      return withSessionCookie(await fn(sid, req, clientIp(req)), sid, fresh);
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      console.error(JSON.stringify({ level: "error", msg: "route failed", path: new URL(req.url).pathname, err: String((e as Error)?.message ?? e) }));
      return withSessionCookie(
        Response.json({ error: timeout ? "The authorization server timed out." : "The authorization server is unreachable." }, { status: 502 }),
        sid, fresh,
      );
    }
  };
}

/** The visitor's address as seen by the platform. On Vercel x-forwarded-for is overwritten, so it cannot be spoofed;
 *  anywhere else it is only a hint, which is fine: a wrong value only changes which rate-limit bucket the caller lands in. */
export function clientIp(req: Request): string {
  const raw = req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "";
  const first = raw.split(",")[0].trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(first) ? first : "";
}

/** Reject cross-site form posts. Same-origin fetches from our own UI always send Origin. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients (curl, tests); browsers always send it on POST
  try { return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host")); } catch { return false; }
}
