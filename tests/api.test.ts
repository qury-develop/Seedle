import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { handleApi } from "../server/api";
import { createAuth } from "../server/auth";
import { consumeLimit } from "../server/security";
import type { AppEnv } from "../server/env";
import type { SeedPost } from "../lib/contracts";

let mf: Miniflare;
let env: AppEnv;
let alice: string;
let bob: string;
let beginner: string;
const aliceId = randomUUID();
const bobId = randomUUID();
const draft = { title: "本番の投稿", category: "仕事", problem: "困っていること", desired: "こうなってほしい", targetUser: "", workaround: "", status: "募集中", isAnonymous: false, publishedUrl: "" };

async function fixture(id: string, nickname?: string, expired = false, verified = true) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, "Private Google Name", `${id}@example.com`, Number(verified), now, now),
    env.DB.prepare("INSERT INTO auth_session (id, token, user_id, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(randomUUID(), token, id, now + (expired ? -1000 : 86400000), now, now),
  ]);
  if (nickname) await env.DB.prepare("INSERT INTO profiles (id, nickname) VALUES (?, ?)").bind(id, nickname).run();
  const signature = createHmac("sha256", env.BETTER_AUTH_SECRET).update(token).digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}
function request(path: string, method = "GET", body?: unknown, cookie?: string, origin = env.APP_URL) {
  const headers = new Headers({ "Content-Type": "application/json", Origin: origin, "cf-connecting-ip": "127.0.0.1" });
  if (cookie) headers.set("Cookie", cookie);
  return handleApi(new Request(`${env.APP_URL}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env);
}
async function create(cookie = alice, values = {}) {
  const response = await request("/api/posts", "POST", { ...draft, ...values }, cookie);
  assert.equal(response.status, 201, await response.clone().text());
  return response.json() as Promise<SeedPost>;
}
before(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('test') } }", compatibilityDate: "2026-05-15", d1Databases: ["DB"] });
  env = { DB: await mf.getD1Database("DB") as unknown as AppEnv["DB"], APP_URL: "http://localhost:3000", BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"), GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "test-only-secret" };
  const migration = await readFile(new URL("../drizzle/0000_initial.sql", import.meta.url), "utf8");
  await env.DB.batch(migration.split("--> statement-breakpoint").filter((s) => s.trim()).map((sql) => env.DB.prepare(sql)));
  alice = await fixture(aliceId, "同じニックネーム"); bob = await fixture(bobId, "同じニックネーム"); beginner = await fixture(randomUUID());
});
after(async () => { await mf?.dispose(); });

test("anonymous reads have no sample records or personal data; cookies are not cached", async () => {
  const response = await request("/api/posts");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.deepEqual((await response.json()).items, []);
  assert.equal((await (await request("/api/me")).json()).user, null);
});
test("real signed DB session is required, including nickname onboarding and expiry", async () => {
  assert.equal((await request("/api/posts", "POST", draft)).status, 401);
  assert.equal((await request("/api/posts", "POST", draft, "better-auth.session_token=fake")).status, 401);
  assert.equal((await request("/api/posts", "POST", draft, beginner)).status, 403);
  assert.equal((await request("/api/profile", "PUT", { nickname: "登録済み" }, beginner)).status, 200);
  assert.equal((await (await request("/api/me", "GET", undefined, beginner)).json()).user.nickname, "登録済み");
  const expired = await fixture(randomUUID(), "期限切れ", true);
  assert.equal((await request("/api/posts", "POST", draft, expired)).status, 401);
  const unverified = await fixture(randomUUID(), "未確認", false, false);
  assert.equal((await request("/api/posts", "POST", draft, unverified)).status, 401);
});
test("post persistence and ownership use identity, never the nickname", async () => {
  const post = await create();
  const reloaded = await (await request(`/api/posts/${post.id}`, "GET", undefined, alice)).json();
  assert.equal(reloaded.title, draft.title); assert.equal(reloaded.isOwner, true);
  const other = await (await request(`/api/posts/${post.id}`, "GET", undefined, bob)).json();
  assert.equal(other.isOwner, false);
  assert.equal((await request(`/api/posts/${post.id}`, "PATCH", { ...draft, title: "乗っ取り", version: 1 }, bob)).status, 403);
  assert.equal((await request(`/api/posts/${post.id}`, "DELETE", undefined, bob)).status, 403);
  const update = await request(`/api/posts/${post.id}`, "PATCH", { ...draft, title: "編集後", status: "公開済み", publishedUrl: "https://example.com/product", version: 1 }, alice);
  assert.equal(update.status, 200); assert.equal((await update.json()).version, 2);
  assert.equal((await request(`/api/posts/${post.id}`, "PATCH", { ...draft, version: 1 }, alice)).status, 409);
  assert.equal((await request("/api/profile", "PUT", { nickname: "変更した名前" }, alice)).status, 200);
  const after = await (await request(`/api/posts/${post.id}`, "GET", undefined, alice)).json();
  assert.equal(after.author, "変更した名前"); assert.equal(after.isOwner, true);
  const mine = await (await request("/api/posts?mode=mine", "GET", undefined, bob)).json();
  assert.equal(mine.total, 0);
});
test("anonymous posts do not expose the owner ID, Google name or email", async () => {
  const post = await create(alice, { isAnonymous: true });
  const response = await request(`/api/posts/${post.id}`);
  const text = await response.text();
  const publicPost = JSON.parse(text);
  assert.equal(publicPost.author, "匿名"); assert.equal(publicPost.isOwner, false);
  assert.ok(!text.includes(aliceId)); assert.ok(!text.includes("変更した名前"));
  assert.ok(!text.includes("Private Google Name")); assert.ok(!text.includes("@example.com"));
});
test("reactions are idempotent under concurrent requests and isolated by user", async () => {
  const post = await create();
  const responses = await Promise.all(Array.from({ length: 4 }, () => request(`/api/posts/${post.id}/reactions/watch`, "PUT", { active: true }, bob)));
  for (const response of responses) assert.equal(response.status, 200, await response.clone().text());
  const asBob = await (await request(`/api/posts/${post.id}`, "GET", undefined, bob)).json();
  assert.equal(asBob.watchCount, 1); assert.equal(asBob.reactions.watch, true);
  const asAlice = await (await request(`/api/posts/${post.id}`, "GET", undefined, alice)).json();
  assert.equal(asAlice.reactions.watch, false);
  assert.equal((await (await request("/api/posts?mode=watching", "GET", undefined, bob)).json()).total, 1);
  await request(`/api/posts/${post.id}/reactions/watch`, "PUT", { active: false }, bob);
  await request(`/api/posts/${post.id}/reactions/watch`, "PUT", { active: false }, bob);
  assert.equal((await (await request(`/api/posts/${post.id}`)).json()).watchCount, 0);
});
test("comments persist, reject another user's deletion and cascade with their post", async () => {
  const post = await create();
  const response = await request(`/api/posts/${post.id}/comments`, "POST", { body: "コメント本文" }, bob);
  assert.equal(response.status, 201); const comment = await response.json();
  const comments = await (await request(`/api/posts/${post.id}/comments`)).json();
  assert.equal(comments.items[0].body, "コメント本文"); assert.equal(comments.items[0].isOwner, false);
  assert.equal((await request(`/api/comments/${comment.id}`, "DELETE", undefined, alice)).status, 403);
  assert.equal((await request(`/api/comments/${comment.id}`, "DELETE", undefined, bob)).status, 204);
  await request(`/api/posts/${post.id}/comments`, "POST", { body: "削除対象" }, bob);
  await request(`/api/posts/${post.id}/reactions/want`, "PUT", { active: true }, bob);
  assert.equal((await request(`/api/posts/${post.id}`, "DELETE", undefined, alice)).status, 204);
  assert.equal((await request(`/api/posts/${post.id}`)).status, 404);
  assert.equal((await env.DB.prepare("SELECT count(*) AS count FROM comments WHERE post_id=?").bind(post.id).first<{count: number}>())?.count, 0);
  assert.equal((await env.DB.prepare("SELECT count(*) AS count FROM reactions WHERE post_id=?").bind(post.id).first<{count: number}>())?.count, 0);
});
test("CSRF, invalid input, URL injection and oversized payloads are rejected", async () => {
  assert.equal((await request("/api/profile", "PUT", { nickname: "bad" }, alice, "https://attacker.example")).status, 403);
  assert.equal((await request("/api/profile", "PUT", { nickname: "bad" }, alice, "")).status, 403);
  assert.equal((await request("/api/profile", "PUT", { nickname: " " }, alice)).status, 400);
  assert.equal((await request("/api/posts", "POST", { ...draft, title: "a".repeat(121) }, alice)).status, 400);
  assert.equal((await request("/api/posts", "POST", { ...draft, publishedUrl: "javascript:alert(1)" }, alice)).status, 400);
  assert.equal((await request("/api/posts", "POST", { ...draft, authorId: bobId }, alice)).status, 400);
  assert.equal((await request("/api/profile", "PUT", { nickname: "a".repeat(33000) }, alice)).status, 413);
  assert.equal((await request("/api/posts?page=-1")).status, 400);
  assert.equal((await request("/api/posts?mode=mine")).status, 401);
});
test("search and pagination are server-side, bounded and parameterized", async () => {
  const now = new Date().toISOString();
  await env.DB.batch(Array.from({ length: 24 }, (_, i) => env.DB.prepare("INSERT INTO posts (id, author_id, title, category, problem, desired, created_at, updated_at) VALUES (?, ?, ?, '学び', '学習', '保存', ?, ?)").bind(randomUUID(), aliceId, `検索ページ ${i}`, now, now)));
  const first = await (await request("/api/posts?category=学び&q=検索ページ&page=1")).json();
  const second = await (await request("/api/posts?category=学び&q=検索ページ&page=2")).json();
  assert.equal(first.total, 24); assert.equal(first.items.length, 20); assert.equal(second.items.length, 4);
  assert.equal(new Set([...first.items, ...second.items].map((p: SeedPost) => p.id)).size, 24);
  assert.equal((await (await request("/api/posts?q=" + encodeURIComponent("%' OR 1=1 --"))).json()).total, 0);
});
test("rate limits are atomic and expire", async () => {
  const results = await Promise.all(Array.from({ length: 6 }, () => consumeLimit(env, "test-limit", 3, 60)));
  assert.equal(results.filter((r) => r.allowed).length, 3);
  await env.DB.prepare("UPDATE rate_limits SET expires_at=0 WHERE key='test-limit'").run();
  assert.equal((await consumeLimit(env, "test-limit", 3, 60)).allowed, true);
});
test("Google sign-in uses OAuth state and PKCE, and rejects forged callbacks", async () => {
  const response = await request("/api/auth/sign-in/social", "POST", { provider: "google", callbackURL: env.APP_URL, disableRedirect: true });
  assert.equal(response.status, 200, await response.clone().text());
  const url = new URL((await response.json()).url);
  assert.equal(url.hostname, "accounts.google.com"); assert.ok(url.searchParams.get("state"));
  assert.ok(url.searchParams.get("code_challenge")); assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("redirect_uri"), env.APP_URL + "/api/auth/callback/google");
  const cookies = response.headers.getSetCookie().join(";"); assert.match(cookies, /HttpOnly/i); assert.match(cookies, /SameSite=Lax/i);
  const invalid = await request("/api/auth/callback/google?code=fake&state=fake");
  assert.ok(invalid.status >= 300); assert.ok(!invalid.headers.getSetCookie().join("").includes("session_token="));
  const unsafeRedirect = await request("/api/auth/sign-in/social", "POST", { provider: "google", callbackURL: "https://attacker.example", disableRedirect: true });
  assert.equal(unsafeRedirect.status, 403);
  const prod = await createAuth({ ...env, APP_URL: "https://seedle.example" }).$context;
  assert.equal(prod.authCookies.sessionToken.attributes.secure, true);
});
test("logout revokes the server session; missing secrets never enable fake sign-in", async () => {
  const cookie = await fixture(randomUUID(), "ログアウト");
  assert.equal((await request("/api/auth/sign-out", "POST", {}, cookie)).status, 200);
  assert.equal((await (await request("/api/me", "GET", undefined, cookie)).json()).user, null);
  const response = await handleApi(new Request(env.APP_URL + "/api/auth/sign-in/social", { method: "POST", headers: { Origin: env.APP_URL, "Content-Type": "application/json" }, body: JSON.stringify({ provider: "google" }) }), { ...env, GOOGLE_CLIENT_SECRET: "" });
  assert.equal(response.status, 503);
});
