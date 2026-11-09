export type Wire = { request: string; response: string; ms: number; status: number };
export type Check = { id: string; label: string; clause: string; actor: string; status: "pass" | "fail" | "skipped" | "off"; detail?: string };
export type SignResult = { header: Record<string, unknown>; claims: Record<string, unknown>; assertion: string; wire: Wire };
export type TokenResult = { status: number; body: Record<string, unknown>; checks: Check[]; wire: Wire; note?: string };
export type ModeInfo = { key: string; label: string; status: string; description: string };
export type Config = { modes: Record<string, boolean>; info: ModeInfo[] };
export type TrafficEntry = {
  id: number; at: string; method: string; path: string; status?: number; ms?: number;
  requestBody?: string; responseBody?: string; note?: string; checks?: Check[];
};
export type SignRequest = {
  claims: Record<string, unknown>; header: Record<string, unknown>; expiresIn: string;
  omit: string[]; badSignature: boolean; unregisteredKey: boolean;
};
