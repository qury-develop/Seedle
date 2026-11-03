import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../dist/server/", import.meta.url));
const assets = fileURLToPath(new URL("../dist/client/", import.meta.url));
const output = fileURLToPath(new URL("../test-results/", import.meta.url));
const secret = randomBytes(48).toString("base64url");
const files = (await readdir(root, { recursive: true })).filter((p) => p.endsWith(".js") && p !== "index.js");
const options = {
  port: 0,
  modulesRoot: root,
  modules: ["index.js", ...files].map((p) => ({ type: "ESModule", path: join(root, p) })),
  compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"],
  assets: { directory: assets, binding: "ASSETS", routerConfig: { has_user_worker: true } },
  bindings: { APP_URL: "http://localhost:3000", BETTER_AUTH_SECRET: secret, GOOGLE_CLIENT_ID: "browser-test.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "only-for-isolated-tests" },
};
const worker = new Miniflare(options);
let browser;
try {
  const initialUrl = await worker.ready;
  const origin = initialUrl.origin;
  await worker.setOptions({ ...options, port: Number(initialUrl.port), bindings: { ...options.bindings, APP_URL: origin } });
  const db = await worker.getD1Database("DB");
  const sql = await readFile(new URL("../drizzle/0000_initial.sql", import.meta.url), "utf8");
  await db.batch(sql.split("--> statement-breakpoint").filter((s) => s.trim()).map((s) => db.prepare(s)));
  const id = randomUUID(); const token = randomBytes(32).toString("base64url"); const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at) VALUES (?, 'Private Name', 'test@example.com', 1, ?, ?)").bind(id, now, now),
    db.prepare("INSERT INTO auth_session (id, token, user_id, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(randomUUID(), token, id, now + 86400000, now, now),
  ]);
  browser = await chromium.launch({ headless: true, ...(process.env.SEEDLE_BROWSER_EXECUTABLE ? { executablePath: process.env.SEEDLE_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${token}.${signature}`), url: origin, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByRole("heading", { name: "Seedleで使うニックネーム" }).waitFor();
  await page.getByLabel("ニックネーム", { exact: true }).fill("ブラウザ検証");
  await page.getByRole("button", { name: "保存する", exact: true }).click();
  await page.getByRole("heading", { name: "投稿一覧", exact: true }).waitFor();
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  await page.getByLabel("タイトル（必須）").fill("保存されるほしい");
  await page.getByLabel("どんな困りごと？（必須）").fill("作業をまたぐと内容がなくなってしまう。");
  await page.getByLabel("どうなったら嬉しい？（必須）").fill("次に開いたときも内容が残っている。");
  await page.getByRole("button", { name: "投稿する", exact: true }).click();
  await page.getByRole("heading", { name: "保存されるほしい", exact: true }).waitFor();
  const postUrl = page.url();
  await page.reload();
  await page.getByRole("heading", { name: "保存されるほしい", exact: true }).waitFor();
  await page.getByRole("button", { name: /^ほしい 0$/ }).click();
  await page.getByRole("button", { name: /^ほしい 1$/ }).waitFor();
  await page.getByLabel("コメント", { exact: true }).fill("再読み込みでも残るコメント");
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await page.getByText("再読み込みでも残るコメント", { exact: true }).waitFor();
  await page.getByRole("button", { name: "編集", exact: true }).click();
  await page.getByLabel("タイトル（必須）").fill("編集して公開したほしい");
  await page.getByLabel("ステータス", { exact: true }).selectOption("公開済み");
  await page.getByLabel("公開URL（任意）").fill("https://example.com/product");
  await page.getByLabel("投稿者名を匿名にする").check();
  await page.getByRole("button", { name: "変更を保存", exact: true }).click();
  await page.getByRole("heading", { name: "編集して公開したほしい", exact: true }).waitFor();
  await page.getByRole("link", { name: "公開されたサービスを見る" }).waitFor();
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: join(output, "desktop.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, "mobile.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("button", { name: "マイページ", exact: true }).click();
  await page.getByRole("button", { name: "ニックネーム変更", exact: true }).click();
  await page.getByLabel("ニックネーム", { exact: true }).fill("変更後の名前");
  await page.getByRole("button", { name: "保存する", exact: true }).click();
  await page.getByRole("heading", { name: "変更後の名前", exact: true }).waitFor();
  await page.getByRole("heading", { name: "編集して公開したほしい", exact: true }).click();
  await page.getByRole("button", { name: "編集", exact: true }).waitFor();
  const visitor = await browser.newContext();
  const publicPage = await visitor.newPage();
  await publicPage.goto(postUrl);
  await publicPage.getByRole("heading", { name: "編集して公開したほしい", exact: true }).waitFor();
  assert.equal(await publicPage.getByRole("button", { name: "編集", exact: true }).count(), 0);
  const publicPost = await (await publicPage.request.get(`${origin}/api/posts/${new URL(postUrl).searchParams.get("post")}`)).json();
  assert.equal(publicPost.author, "匿名"); assert.equal(publicPost.isOwner, false);
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await page.getByRole("heading", { name: "投稿一覧", exact: true }).waitFor();
  assert.equal((await db.prepare("SELECT count(*) AS count FROM posts").first()).count, 0);
  assert.equal((await db.prepare("SELECT count(*) AS count FROM comments").first()).count, 0);
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page.getByRole("button", { name: "ログイン / 新規登録", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("Browser smoke passed: onboarding, create, reload, react, comment, edit, anonymous viewing, nickname change, delete, logout, desktop/mobile layout.");
} finally { await browser?.close(); await worker.dispose(); }
