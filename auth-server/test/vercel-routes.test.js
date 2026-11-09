// The deployed auth server is private except for the routes listed in vercel.json.
// This fails if a private endpoint ever becomes reachable from the internet, or a public one is dropped.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));

/** First matching rewrite wins. Sources here are exact paths or the final "/(.*)" catch-all. */
function routeOf(path) {
  for (const r of cfg.rewrites) {
    const hit = r.source === "/(.*)" || r.source === path;
    if (hit) return r.destination.service;
  }
  return null;
}

const PUBLIC = ["/token", "/jwks", "/.well-known/oauth-authorization-server"];
const PRIVATE = ["/idp/sign", "/config", "/debug/traffic", "/debug/traffic/1", "/debug/reset", "/ready", "/health", "/auth", "/me", "/reg"];

test("the protocol endpoints are routed to the auth server", () => {
  for (const p of PUBLIC) assert.equal(routeOf(p), "auth-server", p);
});

test("everything else, including every internal endpoint, goes to the app", () => {
  for (const p of PRIVATE) assert.equal(routeOf(p), "app", `${p} must not reach the auth server`);
  assert.equal(routeOf("/"), "app");
  assert.equal(routeOf("/api/sign"), "app");
});

test("the catch-all comes last, so it cannot shadow the public routes", () => {
  assert.equal(cfg.rewrites.at(-1).source, "/(.*)");
  assert.equal(cfg.rewrites.at(-1).destination.service, "app");
});

test("the app reaches the auth server over a binding, not a public route", () => {
  assert.ok(cfg.services.app.bindings.some((b) => b.service === "auth-server" && b.env === "AS_URL"));
});
