import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const database = config.d1_databases?.find((db) => db.binding === "DB");
const failures = [];
if (!database?.database_id || database.database_id.startsWith("00000000-")) failures.push("Set DB.database_id to the real Cloudflare D1 database ID in wrangler.jsonc.");
try {
  const url = new URL(config.vars?.APP_URL);
  if (url.protocol !== "https:" || url.origin !== config.vars.APP_URL || url.hostname === "localhost") throw new Error();
} catch { failures.push("Set APP_URL to the final HTTPS origin in wrangler.jsonc (no trailing slash)."); }
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log("Deployment configuration is ready. Configure the three auth secrets before deployment.");
