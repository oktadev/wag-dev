import { z } from "zod";

export const SignSchema = z.object({
  claims: z.record(z.string().max(64), z.unknown()).default({}),
  header: z.object({ typ: z.string().max(64).optional(), kid: z.string().max(64).optional() }).strict().default({}),
  expiresIn: z.string().regex(/^-?\d{1,6}[smhd]$/, "use a number and a unit, e.g. 5m, 30s, -1m").default("5m"),
  omit: z.array(z.enum(["jti", "sub", "exp", "iat", "iss", "aud"])).max(6).default([]),
  badSignature: z.boolean().default(false),
  unregisteredKey: z.boolean().default(false),
}).strict();

export const TokenSchema = z.object({
  grant_type: z.literal("urn:ietf:params:oauth:grant-type:jwt-bearer"),
  assertion: z.string().min(1).max(8192),
  resource: z.string().max(2048).optional(),
  scope: z.string().max(1024).optional(),
}).strict();

export const ConfigSchema = z.object({ rejectReplay: z.boolean(), acceptTokenEndpointAud: z.boolean(), requireResource: z.boolean() }).partial().strict();

export const MAX_BODY = 32 * 1024;
