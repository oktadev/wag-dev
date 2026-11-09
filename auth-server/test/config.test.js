import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("development defaults need nothing", () => {
  const c = loadConfig({});
  assert.equal(c.issuer, "http://localhost:4100");
  assert.equal(c.production, false);
});

test("production refuses to start without secrets, and lists every problem", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "production" }), (e) => {
    for (const k of ["ISSUER", "INTERNAL_TOKEN", "REDIS_URL", "WIDP_PRIVATE_JWK", "PROVIDER_JWKS", "COOKIE_KEYS"]) assert.match(e.message, new RegExp(k));
    return true;
  });
});

test("production requires an https issuer without a path", () => {
  const base = { NODE_ENV: "production", INTERNAL_TOKEN: "x".repeat(32), REDIS_URL: "redis://x", WIDP_PRIVATE_JWK: "{}", PROVIDER_JWKS: "{}", COOKIE_KEYS: "k" };
  assert.throws(() => loadConfig({ ...base, ISSUER: "http://as.example" }), /https/);
  assert.throws(() => loadConfig({ ...base, ISSUER: "https://as.example/tenant" }), /path/);
  assert.equal(loadConfig({ ...base, ISSUER: "https://as.example" }).issuer, "https://as.example");
});

test("short internal token is rejected in production", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "production", ISSUER: "https://a.example", INTERNAL_TOKEN: "short" }), /INTERNAL_TOKEN/);
});
