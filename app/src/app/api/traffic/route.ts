import { exchange, route, sameOrigin } from "@/lib/as";

const pass = (r: { status: number; text: string }) => new Response(r.text, { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const GET = route(async (sid) => pass(await exchange("GET", "/debug/traffic", {}, undefined, { internal: true, sid })));

export const DELETE = route(async (sid, req) => {
  if (!sameOrigin(req)) return Response.json({ error: "Cross-origin request refused." }, { status: 403 });
  return pass(await exchange("POST", "/debug/reset", {}, "{}", { internal: true, sid }));
});
