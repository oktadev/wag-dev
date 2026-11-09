// One JSON object per line on stdout. Never log assertions, tokens or request bodies.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
let min = LEVELS.info;
export const setLogLevel = (l) => { min = LEVELS[l] ?? LEVELS.info; };
export function log(level, msg, fields = {}) {
  if ((LEVELS[level] ?? 20) < min) return;
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields })}\n`);
}
