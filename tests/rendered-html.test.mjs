import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare } from "miniflare";

test("compiled Worker serves Seedle and routes API requests through D1", async () => {
  const root = fileURLToPath(new URL("../dist/server/", import.meta.url));
  const modules = (await readdir(root, { recursive: true })).filter((p) => p.endsWith(".js") && p !== "index.js");
  const worker = new Miniflare({
    modules: ["index.js", ...modules].map((p) => ({ type: "ESModule", path: join(root, p) })),
    modulesRoot: root,
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    bindings: { APP_URL: "http://localhost:3000" },
    serviceBindings: { ASSETS: () => new Response("Not found", { status: 404 }) },
  });
  try {
    const db = await worker.getD1Database("DB");
    const migration = await readFile(new URL("../drizzle/0000_initial.sql", import.meta.url), "utf8");
    await db.batch(migration.split("--> statement-breakpoint").filter((s) => s.trim()).map((s) => db.prepare(s)));
    const response = await worker.dispatchFetch("http://localhost:3000/", { headers: { accept: "text/html" } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>Seedle<\/title>/i);
    assert.match(html, /小さな「ほしい」を、事業の種に。/);
    assert.match(html, /ログイン \/ 新規登録/);
    assert.doesNotMatch(html, /冷蔵庫の中身|seed-001|codex-preview/);
    const posts = await worker.dispatchFetch("http://localhost:3000/api/posts");
    assert.equal(posts.status, 200);
    assert.deepEqual((await posts.json()).items, []);
    const denied = await worker.dispatchFetch("http://localhost:3000/api/posts", {
      method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: "{}",
    });
    assert.equal(denied.status, 401);
  } finally { await worker.dispose(); }
});
