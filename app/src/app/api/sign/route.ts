import { exchange, route, sameOrigin } from "@/lib/as";
import { parseBody } from "@/lib/body";
import { SignSchema } from "@/lib/schemas";

export const POST = route(async (sid, req, ip) => {
  if (!sameOrigin(req)) return Response.json({ error: "Cross-origin request refused." }, { status: 403 });
  const body = await parseBody(req, SignSchema);
  if (!body.ok) return body.res;
  const r = await exchange("POST", "/idp/sign", { "content-type": "application/json" }, JSON.stringify(body.data), { internal: true, sid, ip });
  if (r.status !== 200) return Response.json({ error: `Signing failed (${r.status}).`, wire: r.wire }, { status: 502 });
  return Response.json({ ...JSON.parse(r.text), wire: r.wire });
});
