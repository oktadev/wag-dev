// Key material. Production loads it from the environment so restarts and extra instances agree;
// development generates throwaway keys. The WIdP private key signs assertions (mock WIdP);
// the AS only ever needs its public half for the registration.
import { createPublicKey } from "node:crypto";
import { exportJWK, generateKeyPair, importJWK } from "jose";
import { log } from "./log.js";

export async function loadKeys(config) {
  let widpPrivate, widpJwk;
  if (config.widpPrivateJwk) {
    widpPrivate = await importJWK(config.widpPrivateJwk, "ES256");
    widpJwk = { ...(await exportJWK(createPublicKey(widpPrivate))), kid: config.widpPrivateJwk.kid ?? "key-1", alg: "ES256", use: "sig" };
  } else {
    log("warn", "WIDP_PRIVATE_JWK not set: generating a throwaway WIdP key (dev only)");
    const kp = await generateKeyPair("ES256");
    widpPrivate = kp.privateKey;
    widpJwk = { ...(await exportJWK(kp.publicKey)), kid: "key-2026-10", alg: "ES256", use: "sig" };
  }
  // A key the AS has NOT registered, for the "unregistered key" scenario.
  const stranger = (await generateKeyPair("ES256")).privateKey;

  let providerJwks = config.providerJwks;
  if (!providerJwks) {
    log("warn", "PROVIDER_JWKS not set: generating throwaway provider signing keys (dev only)");
    const kp = await generateKeyPair("RS256", { extractable: true });
    providerJwks = { keys: [{ ...(await exportJWK(kp.privateKey)), kid: "dev-rs256", alg: "RS256", use: "sig" }] };
  }
  return { widpPrivate, widpJwk, stranger, providerJwks };
}
