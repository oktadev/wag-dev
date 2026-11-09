// Environment parsing. Fails fast with every problem listed, so a bad deploy never starts half-configured.
const truthy = (v) => ["1", "true", "yes"].includes(String(v ?? "").toLowerCase());
const int = (v, d) => (v === undefined || v === "" ? d : Number.parseInt(v, 10));

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const port = int(env.PORT, 4100);
  const errors = [];

  const issuer = env.ISSUER ?? (production ? undefined : `http://localhost:${port}`);
  if (!issuer) errors.push("ISSUER is required in production (the public https URL of this server)");
  else {
    try {
      const u = new URL(issuer);
      if (production && u.protocol !== "https:" && !truthy(env.ALLOW_INSECURE_ISSUER)) errors.push("ISSUER must use https in production");
      if (u.search || u.hash) errors.push("ISSUER must not have a query or fragment");
      if (u.pathname !== "/") errors.push("ISSUER must not have a path component (path-prefixed issuers are not supported yet)");
    } catch {
      errors.push(`ISSUER is not a valid URL: ${issuer}`);
    }
  }

  const internalToken = env.INTERNAL_TOKEN;
  if (production && (!internalToken || internalToken.length < 32)) errors.push("INTERNAL_TOKEN (>= 32 chars) is required in production");

  const redisUrl = env.REDIS_URL;
  const allowMemoryStore = truthy(env.ALLOW_MEMORY_STORE);
  if (production && !redisUrl && !allowMemoryStore) errors.push("REDIS_URL is required in production (set ALLOW_MEMORY_STORE=1 only for a single-instance demo)");

  if (production && redisUrl && !allowMemoryStore) {
    let proto = "";
    try { proto = new URL(redisUrl).protocol; } catch { errors.push("REDIS_URL is not a valid URL"); }
    if (proto && proto !== "rediss:" && !truthy(env.ALLOW_INSECURE_REDIS)) {
      errors.push("REDIS_URL must use rediss:// (TLS) in production: the connection carries the password and stored access tokens (set ALLOW_INSECURE_REDIS=1 only for a private network you trust)");
    }
  }

  const parseJson = (name, required) => {
    const raw = env[name];
    if (!raw) { if (production && required) errors.push(`${name} is required in production (run: pnpm --filter @wag/auth-server keys)`); return undefined; }
    try { return JSON.parse(raw); } catch { errors.push(`${name} is not valid JSON`); return undefined; }
  };
  const widpPrivateJwk = parseJson("WIDP_PRIVATE_JWK", true);
  const providerJwks = parseJson("PROVIDER_JWKS", true);
  const cookieKeys = env.COOKIE_KEYS ? env.COOKIE_KEYS.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  if (production && !cookieKeys?.length) errors.push("COOKIE_KEYS is required in production");

  if (errors.length) throw new Error(`Invalid configuration:\n - ${errors.join("\n - ")}`);

  return {
    production, port, issuer,
    widpIssuer: env.WIDP_ISSUER ?? "https://acme.agents.platform.example",
    resource: env.RESOURCE ?? "https://tickets.saas.example",
    internalToken, redisUrl, allowMemoryStore,
    widpPrivateJwk, providerJwks, cookieKeys,
    trustProxy: truthy(env.TRUST_PROXY),
    rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 120),
    heavyPerMin: int(env.HEAVY_RATE_LIMIT_PER_MIN, 30), // /token and /idp/sign, per client IP
    dailyBudget: int(env.DAILY_BUDGET, 5000), // /token + /idp/sign across ALL visitors per UTC day
    maxBodyBytes: int(env.MAX_BODY_BYTES, 16 * 1024),
    requestTimeoutMs: int(env.REQUEST_TIMEOUT_MS, 15000),
    logLevel: env.LOG_LEVEL ?? "info",
  };
}
