// Entrypoint: configuration, store, keys, then listen. Shuts down cleanly on SIGTERM (Vercel gives 30s).
import { createApp } from "./src/app.js";
import { loadConfig } from "./src/config.js";
import { loadKeys } from "./src/keys.js";
import { log, setLogLevel } from "./src/log.js";
import { createMemoryStore, createRedisStore } from "./src/store.js";

let config;
try { config = loadConfig(); } catch (e) { console.error(e.message); process.exit(1); }
setLogLevel(config.logLevel);

const store = config.redisUrl ? createRedisStore(config.redisUrl) : createMemoryStore();
if (store.kind === "memory") log("warn", "using the in-memory store: state is lost on restart and not shared between instances");
const app = await createApp({ config, store, keys: await loadKeys(config) });

app.server.listen(config.port, "0.0.0.0", () => log("info", "listening", { port: config.port, issuer: config.issuer, widp: config.widpIssuer, store: store.kind }));

let closing = false;
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, async () => {
    if (closing) return; closing = true;
    log("info", "shutting down", { sig });
    const t = setTimeout(() => process.exit(1), 25_000); t.unref();
    await app.close().catch((e) => log("error", "close failed", { err: String(e.message) }));
    process.exit(0);
  });
}
process.on("unhandledRejection", (e) => log("error", "unhandledRejection", { err: String(e?.message ?? e) }));
