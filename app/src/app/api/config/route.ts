import { exchange, route, sameOrigin } from "@/lib/as";
import { parseBody } from "@/lib/body";
import { ConfigSchema } from "@/lib/schemas";

const pass = (r: { status: number; text: string }) => new Response(r.text, { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const GET = route(async (sid) => pass(await exchange("GET", "/config", {}, undefined, { internal: true, sid })));

export const POST = route(async (sid, req) => {
  if (!sameOrigin(req)) return Response.json({ error: "Cross-origin request refused." }, { status: 403 });
  const body = await parseBody(req, ConfigSchema);
  if (!body.ok) return body.res;
  return pass(await exchange("POST", "/config", { "content-type": "application/json" }, JSON.stringify(body.data), { internal: true, sid }));
});
