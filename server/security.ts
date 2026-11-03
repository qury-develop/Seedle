import type { AppEnv } from "./env";
import { appOrigin } from "./env";
export class HttpError extends Error {
  constructor(public status: number, message: string, public headers?: HeadersInit) { super(message); }
}
export function assertSameOrigin(request: Request, env: AppEnv) {
  if (request.headers.get("origin") !== appOrigin(env) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "この操作はSeedleの画面から行ってください。");
  }
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "JSON形式で送信してください。");
  const limit = 32_768;
  if (Number(request.headers.get("content-length")) > limit) throw new HttpError(413, "入力が長すぎます。");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "入力を確認してください。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new HttpError(413, "入力が長すぎます。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(body)) as unknown; }
  catch { throw new HttpError(400, "入力を確認してください。"); }
}
// One atomic upsert avoids a read/increment race across Worker instances.
export async function consumeLimit(env: AppEnv, key: string, max: number, seconds: number) {
  const now = Date.now();
  const row = await env.DB.prepare(`INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
      expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    RETURNING count, expires_at`).bind(key, now + seconds * 1000, now, now).first<{count: number; expires_at: number}>();
  if (!row) throw new Error("Rate limit storage unavailable");
  return { allowed: row.count <= max, retryAfter: Math.max(1, Math.ceil((row.expires_at - now) / 1000)) };
}
export async function rateLimit(env: AppEnv, key: string, max: number, seconds: number) {
  const result = await consumeLimit(env, key, max, seconds);
  if (!result.allowed) throw new HttpError(429, "操作が続いています。少し待ってからお試しください。", { "Retry-After": String(result.retryAfter) });
}
export function secured(response: Response, request: Request) {
  const result = new Response(response.body, response);
  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  result.headers.set("X-Frame-Options", "DENY");
  result.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  result.headers.set("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  if (new URL(request.url).protocol === "https:") result.headers.set("Strict-Transport-Security", "max-age=31536000");
  return result;
}
