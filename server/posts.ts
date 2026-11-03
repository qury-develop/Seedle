import type { SeedPost, Viewer, Draft } from "../lib/contracts";
import type { AppEnv } from "./env";
import { HttpError } from "./security";

type PostRow = Omit<SeedPost, "reactions" | "isOwner" | "isAnonymous"> & {
  isOwner: number; isAnonymous: number; wanted: number; building: number; watching: number;
};

const selection = `SELECT p.id, p.title, p.category, p.status, p.problem, p.desired,
  coalesce(p.target_user, '') AS targetUser, coalesce(p.current_workaround, '') AS workaround,
  p.is_anonymous AS isAnonymous, p.published_url AS publishedUrl, p.version,
  p.created_at AS createdAt, p.updated_at AS updatedAt,
  CASE WHEN p.is_anonymous = 1 THEN '匿名' ELSE a.nickname END AS author,
  p.author_id = ? AS isOwner,
  (SELECT count(*) FROM reactions r WHERE r.post_id = p.id AND r.kind = 'want') AS wantCount,
  (SELECT count(*) FROM reactions r WHERE r.post_id = p.id AND r.kind = 'build') AS buildCount,
  (SELECT count(*) FROM reactions r WHERE r.post_id = p.id AND r.kind = 'watch') AS watchCount,
  (SELECT count(*) FROM comments c WHERE c.post_id = p.id) AS commentCount,
  EXISTS(SELECT 1 FROM reactions r WHERE r.post_id = p.id AND r.profile_id = ? AND r.kind = 'want') AS wanted,
  EXISTS(SELECT 1 FROM reactions r WHERE r.post_id = p.id AND r.profile_id = ? AND r.kind = 'build') AS building,
  EXISTS(SELECT 1 FROM reactions r WHERE r.post_id = p.id AND r.profile_id = ? AND r.kind = 'watch') AS watching
  FROM posts p JOIN profiles a ON a.id = p.author_id`;

function present(row: PostRow): SeedPost {
  const { wanted, building, watching, ...post } = row;
  return { ...post, isOwner: Boolean(row.isOwner), isAnonymous: Boolean(row.isAnonymous),
    reactions: { want: Boolean(wanted), build: Boolean(building), watch: Boolean(watching) } };
}

export async function getPost(env: AppEnv, id: string, viewer: Viewer | null) {
  const uid = viewer?.id ?? "";
  const row = await env.DB.prepare(`${selection} WHERE p.id = ?`).bind(uid, uid, uid, uid, id).first<PostRow>();
  if (!row) throw new HttpError(404, "投稿が見つかりません。削除された可能性があります。");
  return present(row);
}

export async function listPosts(env: AppEnv, url: URL, viewer: Viewer | null, page: number) {
  const mode = url.searchParams.get("mode") || "all";
  if (!["all", "mine", "watching", "building"].includes(mode)) throw new HttpError(400, "表示条件を確認してください。");
  if (mode !== "all" && !viewer) throw new HttpError(401, "ログインしてください。");
  const uid = viewer?.id ?? "";
  const clauses: string[] = [];
  const values: string[] = [];
  const category = url.searchParams.get("category");
  if (category && category !== "すべて") { clauses.push("p.category = ?"); values.push(category); }
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length > 120) throw new HttpError(400, "検索語は120文字以内で入力してください。");
  if (q) {
    clauses.push("(p.title LIKE ? ESCAPE '\\' OR p.problem LIKE ? ESCAPE '\\' OR p.desired LIKE ? ESCAPE '\\')");
    const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    values.push(pattern, pattern, pattern);
  }
  if (mode === "mine") { clauses.push("p.author_id = ?"); values.push(uid); }
  if (mode === "watching" || mode === "building") {
    clauses.push("EXISTS(SELECT 1 FROM reactions r WHERE r.post_id = p.id AND r.profile_id = ? AND r.kind = ?)");
    values.push(uid, mode === "watching" ? "watch" : "build");
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const order = url.searchParams.get("sort") === "new" ? "createdAt DESC, p.id DESC" : "(wantCount * 2 + buildCount * 3 + watchCount) DESC, createdAt DESC, p.id DESC";
  const pageSize = 20;
  const [rows, totals, stats] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare(`${selection}${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(uid, uid, uid, uid, ...values, pageSize, (page - 1) * pageSize),
    env.DB.prepare(`SELECT count(*) AS total FROM posts p${where}`).bind(...values),
    env.DB.prepare(`SELECT (SELECT count(*) FROM posts) AS posts,
      (SELECT count(*) FROM reactions WHERE kind = 'want') AS wants,
      (SELECT count(*) FROM reactions WHERE kind = 'build') AS builders`),
  ]);
  return { items: (rows.results as unknown as PostRow[]).map(present), total: Number(totals.results[0].total), page, pageSize,
    stats: { posts: Number(stats.results[0].posts), wants: Number(stats.results[0].wants), builders: Number(stats.results[0].builders) } };
}

export async function savePost(env: AppEnv, viewer: Viewer, data: Draft, id?: string, version?: number) {
  const now = new Date().toISOString();
  const values = [data.title, data.category, data.status, data.problem, data.desired, data.targetUser, data.workaround, Number(data.isAnonymous), data.status === "公開済み" ? data.publishedUrl : ""];
  if (id) {
    const post = await getPost(env, id, viewer);
    if (!post.isOwner) throw new HttpError(403, "この投稿を変更する権限がありません。");
    const result = await env.DB.prepare(`UPDATE posts SET title=?, category=?, status=?, problem=?, desired=?, target_user=?,
      current_workaround=?, is_anonymous=?, published_url=?, updated_at=?, version=version+1
      WHERE id=? AND author_id=? AND version=?`).bind(...values, now, id, viewer.id, version).run();
    if (!result.meta.changes) throw new HttpError(409, "投稿が別の画面で更新されました。最新の投稿を開き直してください。");
  } else {
    id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO posts (title, category, status, problem, desired, target_user, current_workaround,
      is_anonymous, published_url, id, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...values, id, viewer.id, now, now).run();
  }
  return getPost(env, id, viewer);
}
