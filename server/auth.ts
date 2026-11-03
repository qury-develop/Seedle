import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { appOrigin, authConfigured, type AppEnv } from "./env";
import { consumeLimit, HttpError } from "./security";
export function createAuth(env: AppEnv) {
  if (!authConfigured(env)) throw new HttpError(503, "ログインの準備中です。しばらくしてからお試しください。");
  const origin = appOrigin(env);
  return betterAuth({
    appName: "Seedle", baseURL: origin, secret: env.BETTER_AUTH_SECRET, trustedOrigins: [origin],
    database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: "sqlite", schema, transaction: false }),
    socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: "select_account", accessType: "online" } },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: origin.startsWith("https:"), ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    rateLimit: {
      enabled: true, window: 60, max: 60, customRules: { "/sign-in/social": { window: 60, max: 10 } },
      customStorage: { consume: async (key, rule) => {
        const result = await consumeLimit(env, `auth:${key}`, rule.max, rule.window);
        return { allowed: result.allowed, retryAfter: result.allowed ? null : result.retryAfter };
      } },
    },
  });
}
