import { AS_URL } from "@/lib/env";

/** Liveness of the app, plus whether the auth server answers. Used by deploy checks. */
export async function GET() {
  const as = await fetch(`${AS_URL}/ready`, { cache: "no-store", signal: AbortSignal.timeout(4000) }).then((r) => r.ok).catch(() => false);
  return Response.json({ ok: true, authServer: as }, { status: 200, headers: { "cache-control": "no-store" } });
}
