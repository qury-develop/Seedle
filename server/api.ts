import { ZodError } from "zod";
import type { Viewer } from "../lib/contracts";
import { createAuth } from "./auth";
import { appOrigin, authConfigured, type AppEnv } from "./env";
import { getPost, listPosts, savePost } from "./posts";
import { assertSameOrigin, HttpError, rateLimit, readJson, secured } from "./security";
import { commentInput, nicknameInput, pageInput, postInput, postUpdate, reactionInput } from "./validation";

async function viewerFor(request: Request, env: AppEnv): Promise<Viewer | null> {
  if (!authConfigured(env) || !request.headers.get("cookie")) return null;
  const session = await createAuth(env).api.getSession({ headers: request.headers });
  if (!session || !session.user.emailVerified) return null;
  const profile = await env.DB.prepare("SELECT nickname FROM profiles WHERE id = ?").bind(session.user.id).first<{nickname: string}>();
  return { id: session.user.id, nickname: profile?.nickname ?? null };
}

async function route(request: Request, env: AppEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (path === "/api/health" && method === "GET") {
    appOrigin(env);
    await env.DB.prepare("SELECT id FROM profiles LIMIT 1").first();
    return Response.json({ status: authConfigured(env) ? "ok" : "setup_required" }, { status: authConfigured(env) ? 200 : 503 });
  }
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new HttpError(405, "対応していない操作です。");
  const writing = method !== "GET";
  if (writing) assertSameOrigin(request, env);
  if (path.startsWith("/api/auth/")) {
    if (!["/api/auth/sign-in/social", "/api/auth/callback/google", "/api/auth/sign-out", "/api/auth/get-session"].includes(path)) {
      throw new HttpError(404, "ページが見つかりません。");
    }
    if (writing) {
      const data = await readJson(request);
      request = new Request(request.url, { method, headers: request.headers, body: JSON.stringify(data) });
    }
    return createAuth(env).handler(request);
  }
  const viewer = await viewerFor(request, env);
  if (path === "/api/me" && method === "GET") return Response.json({ user: viewer, loginAvailable: authConfigured(env) });
  if (writing && !viewer) throw new HttpError(401, "ログインしてください。");
  if (path === "/api/profile" && method === "PUT" && viewer) {
    await rateLimit(env, `profile:${viewer.id}`, 10, 60);
    const { nickname } = nicknameInput.parse(await readJson(request));
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO profiles (id, nickname, created_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET nickname=excluded.nickname, updated_at=excluded.updated_at`).bind(viewer.id, nickname, now, now).run();
    return Response.json({ user: { id: viewer.id, nickname } });
  }
  if (writing && !viewer?.nickname) throw new HttpError(403, "先にニックネームを登録してください。");
  if (writing && viewer) await rateLimit(env, `write:${viewer.id}`, 60, 60);
  if (path === "/api/posts") {
    if (method === "GET") return Response.json(await listPosts(env, url, viewer, pageInput.parse(url.searchParams.get("page") ?? undefined)));
    if (method === "POST" && viewer) {
      await rateLimit(env, `post:${viewer.id}`, 10, 3600);
      return Response.json(await savePost(env, viewer, postInput.parse(await readJson(request))), { status: 201 });
    }
  }
  const postMatch = path.match(/^\/api\/posts\/([a-zA-Z0-9-]{1,64})$/);
  if (postMatch) {
    const id = postMatch[1];
    if (method === "GET") return Response.json(await getPost(env, id, viewer));
    if (method === "PATCH" && viewer) {
      const data = postUpdate.parse(await readJson(request));
      return Response.json(await savePost(env, viewer, data, id, data.version));
    }
    if (method === "DELETE" && viewer) {
      const post = await getPost(env, id, viewer);
      if (!post.isOwner) throw new HttpError(403, "この投稿を削除する権限がありません。");
      await env.DB.prepare("DELETE FROM posts WHERE id = ? AND author_id = ?").bind(id, viewer.id).run();
      return new Response(null, { status: 204 });
    }
  }
  const reactionMatch = path.match(/^\/api\/posts\/([a-zA-Z0-9-]{1,64})\/reactions\/(want|build|watch)$/);
  if (reactionMatch && method === "PUT" && viewer) {
    const [, id, kind] = reactionMatch;
    const { active } = reactionInput.parse(await readJson(request));
    await getPost(env, id, viewer);
    if (active) {
      await env.DB.prepare(`INSERT INTO reactions (post_id, profile_id, kind, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(post_id, profile_id, kind) DO NOTHING`).bind(id, viewer.id, kind, new Date().toISOString()).run();
    } else {
      await env.DB.prepare("DELETE FROM reactions WHERE post_id=? AND profile_id=? AND kind=?").bind(id, viewer.id, kind).run();
    }
    return Response.json(await getPost(env, id, viewer));
  }
  const commentsMatch = path.match(/^\/api\/posts\/([a-zA-Z0-9-]{1,64})\/comments$/);
  if (commentsMatch) {
    const id = commentsMatch[1];
    await getPost(env, id, viewer);
    if (method === "GET") {
      const page = pageInput.parse(url.searchParams.get("page") ?? undefined);
      const pageSize = 30;
      const [comments, count] = await env.DB.batch<Record<string, unknown>>([
        env.DB.prepare(`SELECT c.id, c.body, c.created_at AS createdAt, p.nickname AS author,
          c.author_id = ? AS isOwner FROM comments c JOIN profiles p ON p.id=c.author_id
          WHERE c.post_id=? ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`).bind(viewer?.id ?? "", id, pageSize, (page - 1) * pageSize),
        env.DB.prepare("SELECT count(*) AS total FROM comments WHERE post_id=?").bind(id),
      ]);
      return Response.json({ items: comments.results.map((c) => ({ ...c, isOwner: Boolean(c.isOwner) })), total: count.results[0].total, page, pageSize });
    }
    if (method === "POST" && viewer) {
      await rateLimit(env, `comment:${viewer.id}`, 10, 60);
      const { body } = commentInput.parse(await readJson(request));
      const commentId = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(commentId, id, viewer.id, body, new Date().toISOString()).run();
      return Response.json({ id: commentId }, { status: 201 });
    }
  }
  const commentMatch = path.match(/^\/api\/comments\/([a-zA-Z0-9-]{1,64})$/);
  if (commentMatch && method === "DELETE" && viewer) {
    const comment = await env.DB.prepare("SELECT author_id FROM comments WHERE id=?").bind(commentMatch[1]).first<{author_id: string}>();
    if (!comment) throw new HttpError(404, "コメントが見つかりません。");
    if (comment.author_id !== viewer.id) throw new HttpError(403, "このコメントを削除する権限がありません。");
    await env.DB.prepare("DELETE FROM comments WHERE id=? AND author_id=?").bind(commentMatch[1], viewer.id).run();
    return new Response(null, { status: 204 });
  }
  throw new HttpError(404, "ページが見つかりません。");
}

export async function handleApi(request: Request, env: AppEnv) {
  let response: Response;
  try { response = await route(request, env); }
  catch (error) {
    if (error instanceof HttpError) response = Response.json({ error: error.message }, { status: error.status, headers: error.headers });
    else if (error instanceof ZodError) response = Response.json({ error: error.issues[0]?.message ?? "入力を確認してください。" }, { status: 400 });
    else {
      const errorId = crypto.randomUUID();
      console.error("Seedle API failure", { errorId, method: request.method, path: new URL(request.url).pathname, type: error instanceof Error ? error.name : "unknown" });
      response = Response.json({ error: "処理できませんでした。時間をおいて再度お試しください。", errorId }, { status: 500 });
    }
  }
  response = secured(response, request);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
