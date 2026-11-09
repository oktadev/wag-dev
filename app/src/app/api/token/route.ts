import { exchange, fetchChecks, route, sameOrigin } from "@/lib/as";
import { parseBody } from "@/lib/body";
import { TokenSchema } from "@/lib/schemas";

export const POST = route(async (sid, req, ip) => {
  if (!sameOrigin(req)) return Response.json({ error: "Cross-origin request refused." }, { status: 403 });
  const body = await parseBody(req, TokenSchema);
  if (!body.ok) return body.res;
  const clean = Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== "" && v != null)) as Record<string, string>;
  const r = await exchange("POST", "/token", { "content-type": "application/x-www-form-urlencoded" }, new URLSearchParams(clean).toString(), { sid, ip });
  let parsed: unknown;
  try { parsed = JSON.parse(r.text); } catch { parsed = { error: "server_error", error_description: "The authorization server returned a non-JSON response." }; }
  const { checks, note } = await fetchChecks(r.trace, sid);
  return Response.json({ status: r.status, body: parsed, checks, note, wire: r.wire });
});
