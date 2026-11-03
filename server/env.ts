import type { D1Database } from "@cloudflare/workers-types";
export interface AppEnv {
  DB: D1Database; APP_URL: string; BETTER_AUTH_SECRET: string; GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string;
}
export function appOrigin(env: AppEnv) {
  const url = new URL(env.APP_URL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.origin !== env.APP_URL || url.username || url.password) {
    throw new Error("APP_URL must be an HTTPS origin (HTTP is allowed only on localhost).");
  }
  return url.origin;
}
export function authConfigured(env: AppEnv) {
  return Boolean(env.BETTER_AUTH_SECRET?.length >= 32 && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
