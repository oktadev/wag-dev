export function decodeJwt(token: string) {
  const [h, p, s] = token.split(".");
  if (!h || !p || s === undefined) return null;
  try {
    const dec = (x: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
    return { h, p, s, header: dec(h) as Record<string, unknown>, payload: dec(p) as Record<string, unknown> };
  } catch {
    return null;
  }
}

export const CLAIM_LABELS: Record<string, string> = {
  iss: "Issuer (WIdP)", sub: "Subject (Agent ID)", aud: "Audience (AS)", exp: "Expires", iat: "Issued at",
  jti: "JWT ID", scope: "Scope", nickname: "Nickname (display only)", roles: "Roles", client_id: "Client ID",
  typ: "Type", alg: "Algorithm", kid: "Key ID",
};

export const TIME_CLAIMS = new Set(["exp", "iat", "nbf"]);
