import { describe, expect, it } from "vitest";
import { ConfigSchema, SignSchema, TokenSchema } from "@/lib/schemas";

describe("SignSchema", () => {
  it("fills defaults", () => {
    const r = SignSchema.parse({});
    expect(r.expiresIn).toBe("5m");
    expect(r.omit).toEqual([]);
  });
  it.each(["soon", "5", "5x", "99999999m", ""])("rejects expiresIn %j", (v) => expect(SignSchema.safeParse({ expiresIn: v }).success).toBe(false));
  it("accepts negative lifetimes (to make expired assertions)", () => expect(SignSchema.safeParse({ expiresIn: "-1m" }).success).toBe(true));
  it("rejects unknown keys and unknown omit targets", () => {
    expect(SignSchema.safeParse({ surprise: 1 }).success).toBe(false);
    expect(SignSchema.safeParse({ omit: ["nope"] }).success).toBe(false);
  });
  it("does not let the client choose the signing algorithm", () => expect(SignSchema.safeParse({ header: { alg: "none" } }).success).toBe(false));
});

describe("TokenSchema", () => {
  const ok = { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: "a.b.c" };
  it("accepts a minimal request", () => expect(TokenSchema.safeParse(ok).success).toBe(true));
  it("only the jwt-bearer grant is allowed", () => expect(TokenSchema.safeParse({ ...ok, grant_type: "client_credentials" }).success).toBe(false));
  it("rejects client credentials smuggled in as extra fields", () => {
    expect(TokenSchema.safeParse({ ...ok, client_secret: "x" }).success).toBe(false);
    expect(TokenSchema.safeParse({ ...ok, client_id: "x" }).success).toBe(false);
  });
  it("bounds the assertion size", () => expect(TokenSchema.safeParse({ ...ok, assertion: "x".repeat(9000) }).success).toBe(false));
});

describe("ConfigSchema", () => {
  it("takes partial booleans only", () => {
    expect(ConfigSchema.safeParse({ rejectReplay: true }).success).toBe(true);
    expect(ConfigSchema.safeParse({ rejectReplay: "yes" }).success).toBe(false);
    expect(ConfigSchema.safeParse({ other: true }).success).toBe(false);
  });
});
