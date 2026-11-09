import "server-only";
import { cookies } from "next/headers";

const COOKIE = "wag_sid";
const SID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** A random per-visitor id, kept in an httpOnly cookie. It scopes modes, replay state and the log at the auth server. */
export async function sessionId(): Promise<{ sid: string; fresh: boolean }> {
  const jar = await cookies();
  const have = jar.get(COOKIE)?.value;
  if (have && SID_RE.test(have)) return { sid: have, fresh: false };
  return { sid: crypto.randomUUID().replaceAll("-", ""), fresh: true };
}

export function withSessionCookie(res: Response, sid: string, fresh: boolean) {
  if (fresh) {
    res.headers.append(
      "set-cookie",
      `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
  }
  return res;
}
