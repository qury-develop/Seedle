import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding DB is unavailable. Configure wrangler.jsonc and apply the database migrations."
    );
  }

  return drizzle(env.DB, { schema });
}
