// Generates the key material and secrets a production deployment needs. Prints env lines; store them as secrets.
import { randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair } from "jose";

const widp = await generateKeyPair("ES256", { extractable: true });
const prov = await generateKeyPair("RS256", { extractable: true });
const kid = `key-${new Date().toISOString().slice(0, 7)}`;
const priv = { ...(await exportJWK(widp.privateKey)), kid, alg: "ES256", use: "sig" };
const jwks = { keys: [{ ...(await exportJWK(prov.privateKey)), kid: `rs-${kid}`, alg: "RS256", use: "sig" }] };
console.log(`WIDP_PRIVATE_JWK='${JSON.stringify(priv)}'`);
console.log(`PROVIDER_JWKS='${JSON.stringify(jwks)}'`);
console.log(`COOKIE_KEYS=${randomBytes(32).toString("hex")}`);
console.log(`INTERNAL_TOKEN=${randomBytes(32).toString("hex")}`);
