import "server-only";
import type { z } from "zod";
import { MAX_BODY } from "./schemas";

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: Response }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return { ok: false, res: Response.json({ error: "Request body too large." }, { status: 413 }) };
  const text = await req.text();
  if (text.length > MAX_BODY) return { ok: false, res: Response.json({ error: "Request body too large." }, { status: 413 }) };
  let raw: unknown;
  try { raw = text ? JSON.parse(text) : {}; } catch { return { ok: false, res: Response.json({ error: "Body is not valid JSON." }, { status: 400 }) }; }
  const r = schema.safeParse(raw);
  if (!r.success) return { ok: false, res: Response.json({ error: r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, { status: 400 }) };
  return { ok: true, data: r.data };
}
