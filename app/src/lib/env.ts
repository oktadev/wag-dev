import "server-only";

/** Where the auth server lives. On Vercel services this is injected by the binding; locally it is set by hand. */
export const AS_URL = (process.env.AS_URL ?? "http://localhost:4100").replace(/\/$/, "");
/** Bearer secret for the auth server's internal endpoints. Never sent to the browser. */
export const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;
/** Public https URL shown in generated code snippets. Falls back to the AS's own advertised address. */
export const PUBLIC_AS_URL = (process.env.NEXT_PUBLIC_AS_URL ?? "http://localhost:4100").replace(/\/$/, "");
