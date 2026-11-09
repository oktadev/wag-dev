// WAG playground authorization server.
// node-oidc-provider + a custom jwt-bearer handler implementing the WAG draft, plus a MOCK Workload
// Identity Provider (/idp/sign) so the playground can mint assertions. Not for real deployments.
import http from "node:http";
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet, jwtVerify } from "jose";
import Provider, { errors } from "oidc-provider";
import * as grants from "oidc-provider/lib/helpers/grants.js";

const PORT = Number(process.env.PORT ?? 4100);
const ISSUER = process.env.ISSUER ?? `http://localhost:${PORT}`;
const WIDP = process.env.WIDP_ISSUER ?? "https://acme.agents.platform.example";
const RESOURCE = process.env.RESOURCE ?? "https://tickets.saas.example";
const JWT_BEARER = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const WAG_CLIENT = "wag-anonymous"; // placeholder public client; the draft gives client_id no meaning

// Mock WIdP key + the AS's registration of that WIdP (issuer + keys). Real deployments register out of band.
const { publicKey, privateKey } = await generateKeyPair("ES256");
const jwk = { ...(await exportJWK(publicKey)), kid: "key-2026-10", alg: "ES256", use: "sig" };
const registrations = [{ issuer: WIDP, keys: createLocalJWKSet({ keys: [jwk] }) }];

const provider = new Provider(ISSUER, {
  clients: [{ client_id: WAG_CLIENT, token_endpoint_auth_method: "none", grant_types: [JWT_BEARER], redirect_uris: [], response_types: [] }],
  features: {
    devInteractions: { enabled: false },
    resourceIndicators: {
      enabled: true,
      defaultResource: () => RESOURCE,
      getResourceServerInfo: () => ({ scope: "tickets:read comments:write", accessTokenFormat: "jwt", audience: RESOURCE, accessTokenTTL: 300 }),
    },
  },
  ttl: { AccessToken: 300 },
});

const b64json = (part) => JSON.parse(Buffer.from(part, "base64url").toString());
const fail = (m) => new errors.CustomOIDCProviderError("invalid_grant", m); // keeps error_description (InvalidGrant drops it)

provider.registerGrantType(JWT_BEARER, async (ctx) => {
  const { assertion } = ctx.oidc.params;
  if (!assertion) throw fail("missing assertion. Platform: send the WAG in the assertion parameter.");
  let header, claims;
  try { const [h, p] = assertion.split("."); header = b64json(h); claims = b64json(p); } catch { throw fail("assertion is not a JWT. Platform: reissue."); }
  if (header.typ !== "oauth-wag+jwt") throw fail("typ must be oauth-wag+jwt. Platform: reissue the assertion.");
  const matches = registrations.filter((r) => r.issuer === claims.iss);
  if (matches.length !== 1) throw fail("issuer not trusted. AS admin: register the Workload Identity Provider.");
  let payload;
  try { ({ payload } = await jwtVerify(assertion, matches[0].keys, { issuer: claims.iss, audience: ISSUER, typ: "oauth-wag+jwt" })); }
  catch (e) { throw fail(`invalid assertion (${e.code ?? e.name}). Platform: reissue.`); }
  for (const c of ["sub", "exp", "iat", "jti"]) if (payload[c] === undefined) throw fail(`missing required claim ${c}. Platform: reissue.`);

  const scopes = [...grants.validateClientScope(provider, ctx, (payload.scope ?? "").split(" ").filter(Boolean))];
  const resourceServers = await grants.resolveRequestedResources(provider, ctx);
  const token = new provider.AccessToken({ client: ctx.oidc.client, gty: "jwt-bearer", accountId: `${payload.iss}|${payload.sub}` }); // scoped to (WIdP, sub)
  token.scope = scopes.join(" ") || undefined;
  if (resourceServers[0]) token.resourceServer = resourceServers[0];
  ctx.oidc.entity("AccessToken", token);
  const value = await token.save();
  ctx.body = grants.buildTokenResponse(provider, { accessToken: value, tokenType: token.tokenType, expiresIn: token.expiration, scope: token.scope });
}, ["assertion", "scope", "resource"], ["resource"]);

const readBody = (req) => new Promise((res) => { const c = []; req.on("data", (d) => c.push(d)).on("end", () => res(Buffer.concat(c).toString())); });
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

// Mock WIdP: signs a WAG. `claims`/`header` override defaults so scenarios can build invalid assertions.
async function sign({ claims = {}, header = {}, expiresIn = "5m" } = {}) {
  const c = { sub: "agent/7f3d9as3", nickname: "Database Migration helper", scope: "tickets:read comments:write", ...claims };
  const h = { typ: "oauth-wag+jwt", alg: "ES256", kid: "key-2026-10", ...header };
  const jwt = new SignJWT(c).setProtectedHeader(h)
    .setIssuer(c.iss ?? WIDP).setAudience(c.aud ?? ISSUER).setIssuedAt(c.iat).setJti(crypto.randomUUID());
  jwt.setExpirationTime(expiresIn);
  return { header: h, claims: { iss: c.iss ?? WIDP, aud: c.aud ?? ISSUER, ...c }, assertion: await jwt.sign(privateKey) };
}

const cb = provider.callback();
http.createServer(async (req, res) => {
  try {
    if (req.url === "/health") return json(res, 200, { ok: true, issuer: ISSUER });
    if (req.method === "POST" && req.url === "/idp/sign") return json(res, 200, await sign(JSON.parse((await readBody(req)) || "{}")));
    if (req.method === "POST" && req.url === "/token") {
      const p = new URLSearchParams(await readBody(req));
      if (!p.has("client_id") && !req.headers.authorization) p.set("client_id", WAG_CLIENT); // inject placeholder client
      req.body = Object.fromEntries(p);
    }
    cb(req, res);
  } catch (e) { json(res, 500, { error: "server_error", error_description: String(e.message ?? e) }); }
}).listen(PORT, () => console.log(`WAG auth server on :${PORT} issuer=${ISSUER} trusting WIdP ${WIDP}`));
