"use client";

import { ArrowLeft, Check, ChevronLeft, ChevronRight, ExternalLink, Eye, Heart, Home, KeyRound, LogOut, MessageCircle, Pencil, PlusCircle, RefreshCw, Search, Send, Sprout, Trash2, UserCircle, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, ReactNode } from "react";
import { categories, statuses, emptyDraft } from "../lib/contracts";
import type { Comment, Draft, Feed, ListMode, Page, ReactionKey, SeedPost, Viewer } from "../lib/contracts";

type View = "list" | "compose" | "auth" | "nickname" | "profile" | "detail" | "edit";
type Me = { user: Viewer | null; loginAvailable: boolean };
const labels: Record<ListMode, string> = { all: "すべて", mine: "自分の投稿", watching: "ウォッチ中", building: "作りたい" };
const reactions = { want: { label: "ほしい", Icon: Heart, count: "wantCount" }, build: { label: "作りたい", Icon: Wrench, count: "buildCount" }, watch: { label: "ウォッチ", Icon: Eye, count: "watchCount" } } as const;

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, credentials: "same-origin", headers: { "Content-Type": "application/json", ...options.headers } });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(typeof data?.error === "string" ? data.error : "通信できませんでした。もう一度お試しください。", response.status);
  return data as T;
}
function subscribe(listener: () => void) { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); }
function navigate(path: string, replace = false) {
  window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0 });
}
function pathFor(view: View, id?: string) { return view === "list" ? "/" : `/?view=${view}${id ? `&post=${encodeURIComponent(id)}` : ""}`; }
function safeNext(value: string | null) { return value?.startsWith("/?") || value === "/" ? value : "/"; }
function dateLabel(value: string) { return new Date(value).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }); }
function useResource<T>(url: string | null, revision = 0) {
  const [state, setState] = useState<{url: string | null; revision: number; data?: T; error?: string}>({ url: null, revision: -1 });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    api<T>(url, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setState({ url, revision, data });
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setState({ url, revision, error: error.message });
    });
    return () => controller.abort();
  }, [url, revision]);
  return state.url === url && state.revision === revision ? state : { data: undefined, error: undefined };
}

export function SeedleApp() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const params = new URLSearchParams(search);
  const requestedView = params.get("view") as View | null;
  const postId = params.get("post");
  const view: View = requestedView && ["list", "compose", "auth", "nickname", "profile", "detail", "edit"].includes(requestedView) ? requestedView : postId ? "detail" : "list";
  const [revision, setRevision] = useState(0);
  const me = useResource<Me>("/api/me", revision);
  const user = me.data?.user;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState("すべて");
  const [sort, setSort] = useState("new");
  const [mode, setMode] = useState<ListMode>("all");
  const [page, setPage] = useState(1);
  const [commentPage, setCommentPage] = useState(1);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [commentDraft, setCommentDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{kind: "post" | "comment"; id: string} | null>(null);
  const next = safeNext(params.get("next"));
  const activeView = user && !user.nickname ? "nickname" : view;
  const effectiveMode = activeView === "profile" && mode === "all" ? "mine" : mode;
  const feedUrl = `/api/posts?${new URLSearchParams({ page: String(page), mode: effectiveMode, category, sort, q: debouncedQuery })}`;
  const feed = useResource<Feed>((activeView === "list" || activeView === "profile") && me.data ? feedUrl : null, revision);
  const detail = useResource<SeedPost>((activeView === "detail" || activeView === "edit") && postId && me.data ? `/api/posts/${encodeURIComponent(postId)}` : null, revision);
  const comments = useResource<Page<Comment>>(activeView === "detail" && postId && me.data ? `/api/posts/${encodeURIComponent(postId)}/comments?page=${commentPage}` : null, revision);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  function go(to: View, id?: string) { setError(""); setCommentPage(1); setCommentDraft(""); navigate(pathFor(to, id)); }
  function protect(to: View, id?: string) {
    if (!me.data) return;
    const destination = pathFor(to, id);
    if (!user) navigate(`/?view=auth&next=${encodeURIComponent(destination)}`);
    else if (!user.nickname) navigate(`/?view=nickname&next=${encodeURIComponent(destination)}`);
    else go(to, id);
  }
  async function mutate(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try { await task(); }
    catch (err) {
      setError(err instanceof Error ? err.message : "処理できませんでした。");
      if (err instanceof ApiError && err.status === 401) setRevision((r) => r + 1);
    } finally { busyRef.current = false; setBusy(false); }
  }
  function refresh() { setRevision((r) => r + 1); }
  function changeMode(value: ListMode) {
    if (value !== "all" && !user) { protect("profile"); return; }
    setMode(value); setPage(1);
  }
  async function startGoogle() {
    await mutate(async () => {
      const result = await api<{url: string}>("/api/auth/sign-in/social", { method: "POST", body: JSON.stringify({
        provider: "google", callbackURL: `${window.location.origin}${next}`, errorCallbackURL: `${window.location.origin}/?view=auth&error=oauth`, disableRedirect: true,
      }) });
      window.location.assign(result.url);
    });
  }
  async function submitPost(event: FormEvent<HTMLFormElement>, value: Draft, current?: SeedPost) {
    event.preventDefault();
    if (!user?.nickname) { protect(current ? "edit" : "compose", current?.id); return; }
    await mutate(async () => {
      const saved = await api<SeedPost>(current ? `/api/posts/${current.id}` : "/api/posts", {
        method: current ? "PATCH" : "POST", body: JSON.stringify(current ? { ...value, version: current.version } : value),
      });
      setDraft(emptyDraft); refresh(); go("detail", saved.id);
    });
  }
  async function reactTo(post: SeedPost, kind: ReactionKey) {
    if (!user?.nickname) { protect("detail", post.id); return; }
    await mutate(async () => {
      await api(`/api/posts/${post.id}/reactions/${kind}`, { method: "PUT", body: JSON.stringify({ active: !post.reactions[kind] }) });
      refresh();
    });
  }
  async function remove() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    await mutate(async () => {
      await api(`/api/${target.kind === "post" ? "posts" : "comments"}/${target.id}`, { method: "DELETE" });
      setConfirmDelete(null); refresh();
      if (target.kind === "post") go("list");
    });
  }

  return <main className="min-h-screen bg-[#f3f7f1] text-[#1d2820]">
    <header className="border-b border-[#d9dfd3] bg-[#fbfcf8]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <button className="flex items-center gap-3 text-left" onClick={() => go("list")} type="button">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#235b3b] text-white"><Sprout size={22} aria-hidden="true" /></span>
          <span><span className="block text-lg font-semibold">Seedle</span><span className="block text-xs text-[#607063]">小さな「ほしい」を、事業の種に。</span></span>
        </button>
        <nav aria-label="メインメニュー" className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => go("list")}><Home size={16} />一覧</button>
          <button className="btn" disabled={!me.data} onClick={() => protect("compose")}><PlusCircle size={16} />投稿</button>
          <button className="btn" disabled={!me.data} onClick={() => { setMode("mine"); setPage(1); protect("profile"); }}><UserCircle size={16} />マイページ</button>
          {user ? <button className="btn" disabled={busy} onClick={() => void mutate(async () => { await api("/api/auth/sign-out", { method: "POST", body: "{}" }); setMode("all"); setPage(1); setDraft(emptyDraft); refresh(); go("list"); })}><LogOut size={16} />ログアウト</button>
            : <button className="btn primary" onClick={() => go("auth")}><KeyRound size={16} />ログイン / 新規登録</button>}
        </nav>
      </div>
    </header>
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[250px_1fr]">
      <aside className="space-y-5">
        <section className="border-b border-[#d7dfd3] pb-5">
          <h1 className="text-2xl font-semibold leading-snug">ほしいの温度が<br className="hidden lg:block" />見える場所</h1>
          <p className="mt-3 text-sm leading-6 text-[#546357]">まだ小さな困りごとから、次の事業の種を。</p>
          <button className="btn primary mt-4 w-full" disabled={!me.data} onClick={() => protect("compose")}><PlusCircle size={16} />ほしいを投稿</button>
        </section>
        {feed.data && <section className="grid grid-cols-3 gap-3 lg:grid-cols-1" aria-label="全体の集計">
          {[["投稿", feed.data.stats.posts], ["ほしい", feed.data.stats.wants], ["作りたい", feed.data.stats.builders]].map(([label, value]) => <div key={label}><p className="text-sm text-[#607063]">{label}</p><p className="text-xl font-semibold tabular-nums">{value}</p></div>)}
        </section>}
      </aside>
      <section className="min-w-0" aria-busy={busy}>
        {(error || me.error) && <ErrorMessage message={error || me.error!} onRetry={() => { setError(""); refresh(); }} />}
        {params.get("error") && activeView === "auth" && <ErrorMessage message="Googleログインを完了できませんでした。もう一度お試しください。" />}
        {!me.data && !me.error && <Loading />}
        {me.data && (activeView === "list" || (activeView === "profile" && user)) && <>
          {activeView === "profile" && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#d7dfd3] pb-5">
            <div><p className="text-sm text-[#607063]">マイページ</p><h2 className="break-anywhere mt-1 text-2xl font-semibold">{user?.nickname}</h2></div>
            <button className="btn" onClick={() => navigate("/?view=nickname&next=" + encodeURIComponent(pathFor("profile")))}><Pencil size={16} />ニックネーム変更</button>
          </div>}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">{activeView === "profile" ? labels[effectiveMode] : "投稿一覧"}</h2>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="relative block"><span className="sr-only">困りごとを検索</span><Search className="pointer-events-none absolute left-3 top-3 text-[#607063]" size={18} /><input className="field search-field" value={query} maxLength={120} onChange={(e) => setQuery(e.target.value)} placeholder="困りごとを検索" /></label>
              <select className="field" aria-label="カテゴリ" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option>すべて</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
              <select className="field" aria-label="並び順" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="new">新着順</option><option value="hot">人気順</option></select>
            </div>
            <div className="flex flex-wrap gap-1 border-b border-[#cbd7cb]" role="tablist" aria-label="投稿の種類">
              {(Object.keys(labels) as ListMode[]).filter((m) => activeView !== "profile" || m !== "all").map((m) => <button role="tab" aria-selected={effectiveMode === m} key={m} className={`tab ${effectiveMode === m ? "selected" : ""}`} onClick={() => changeMode(m)}>{labels[m]}</button>)}
            </div>
            {feed.error ? <ErrorMessage message={feed.error} onRetry={refresh} /> : !feed.data ? <Loading /> : <>
              {feed.data.items.length ? <div className="grid gap-3">{feed.data.items.map((post) => <PostCard key={post.id} post={post} onOpen={() => go("detail", post.id)} />)}</div>
                : <p className="py-12 text-center text-[#607063]">該当する投稿はまだありません。</p>}
              <Pagination data={feed.data} onChange={setPage} />
            </>}
          </div>
        </>}
        {me.data && activeView === "detail" && <>
          <button className="btn mb-4" onClick={() => go("list")}><ArrowLeft size={16} />一覧へ戻る</button>
          {detail.error ? <ErrorMessage message={detail.error} onRetry={refresh} /> : !detail.data ? <Loading /> : <>
            <article className="border-b border-[#cbd7cb] pb-6">
              <PostMeta post={detail.data} />
              <h2 className="break-anywhere mt-4 text-2xl font-semibold leading-snug">{detail.data.title}</h2>
              <p className="break-anywhere mt-2 text-sm text-[#607063]">{detail.data.author} ・ {dateLabel(detail.data.createdAt)}</p>
              {detail.data.isOwner && <div className="mt-3 flex gap-2"><button className="btn" disabled={busy} onClick={() => go("edit", detail.data!.id)}><Pencil size={16} />編集</button><button className="btn danger" disabled={busy} onClick={() => setConfirmDelete({ kind: "post", id: detail.data!.id })}><Trash2 size={16} />削除</button></div>}
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {[["どんな困りごと？", detail.data.problem], ["どうなったら嬉しい？", detail.data.desired], ["誰が困っている？", detail.data.targetUser], ["今はどうしている？", detail.data.workaround]].filter(([,text]) => text).map(([title,text]) => <section key={title}><h3 className="font-semibold text-[#235b3b]">{title}</h3><p className="break-anywhere mt-2 whitespace-pre-wrap leading-7">{text}</p></section>)}
              </div>
              {detail.data.status === "公開済み" && detail.data.publishedUrl && <a className="btn mt-4" href={detail.data.publishedUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />公開されたサービスを見る</a>}
              <div className="mt-6 grid grid-cols-3 gap-2">{(Object.keys(reactions) as ReactionKey[]).map((kind) => {
                const { Icon, label, count } = reactions[kind]; const post = detail.data!;
                return <button key={kind} aria-pressed={post.reactions[kind]} disabled={busy} className={`btn reaction-btn ${post.reactions[kind] ? "primary" : ""}`} onClick={() => void reactTo(post, kind)}><span className="flex items-center justify-center gap-1"><Icon size={16} />{label}</span><span className="tabular-nums">{post[count]}</span></button>;
              })}</div>
            </article>
            <section className="mt-6">
              <h3 className="flex items-center gap-2 font-semibold"><MessageCircle size={18} />コメント</h3>
              <form className="mt-4 grid gap-3" onSubmit={(e) => { e.preventDefault(); if (!user?.nickname) { protect("detail", postId!); return; } void mutate(async () => { await api(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ body: commentDraft }) }); setCommentDraft(""); setCommentPage(1); refresh(); }); }}>
                <label><span className="sr-only">コメント</span><textarea className="field min-h-24" value={commentDraft} maxLength={2000} required onChange={(e) => setCommentDraft(e.target.value)} placeholder="追加の困りごとや、作れそうなアイデア" /></label>
                <button className="btn primary justify-self-end" disabled={busy} type="submit"><Send size={16} />{user ? "送信" : "ログインしてコメント"}</button>
              </form>
              {comments.error ? <ErrorMessage message={comments.error} onRetry={refresh} /> : !comments.data ? <Loading /> : <>
                <div className="mt-5 divide-y divide-[#d7dfd3]">{comments.data.items.map((comment) => <article key={comment.id} className="py-4"><p className="break-anywhere whitespace-pre-wrap leading-7">{comment.body}</p><div className="mt-2 flex items-center justify-between gap-2"><p className="break-anywhere text-sm text-[#607063]">{comment.author} ・ {dateLabel(comment.createdAt)}</p>{comment.isOwner && <button className="icon-btn danger" title="コメントを削除" aria-label="コメントを削除" disabled={busy} onClick={() => setConfirmDelete({ kind: "comment", id: comment.id })}><Trash2 size={16} /></button>}</div></article>)}</div>
                {!comments.data.total && <p className="mt-5 text-sm text-[#607063]">まだコメントはありません。</p>}
                <Pagination data={comments.data} onChange={setCommentPage} />
              </>}
            </section>
          </>}
        </>}
        {me.data && activeView === "compose" && <PostForm value={draft} onChange={setDraft} onSubmit={(e) => void submitPost(e, draft)} busy={busy} />}
        {me.data && activeView === "edit" && (detail.error ? <ErrorMessage message={detail.error} onRetry={refresh} /> : !detail.data ? <Loading /> : detail.data.isOwner ? <EditPost key={`${detail.data.id}:${detail.data.version}`} post={detail.data} busy={busy} onSubmit={submitPost} /> : <ErrorMessage message="この投稿を編集する権限がありません。" />)}
        {me.data && (activeView === "auth" || (activeView === "profile" && !user)) && <section>
          <h2 className="text-2xl font-semibold">ログイン / 新規登録</h2><p className="mt-3 leading-7 text-[#607063]">Seedle上では、Googleアカウントの名前ではなくニックネームを表示します。</p>
          <button className="btn primary mt-5" disabled={busy || !me.data.loginAvailable} onClick={() => void startGoogle()}><KeyRound size={16} />Googleで続ける</button>
          {!me.data.loginAvailable && <p role="status" className="mt-3 text-sm text-[#607063]">ログインの準備中です。しばらくしてからお試しください。</p>}
        </section>}
        {me.data && activeView === "nickname" && (user ? <NicknameForm key={user.id + (user.nickname ?? "")} nickname={user.nickname ?? ""} busy={busy} onSubmit={(nickname) => void mutate(async () => {
          await api("/api/profile", { method: "PUT", body: JSON.stringify({ nickname }) }); refresh();
          navigate(user.nickname ? next : view === "nickname" || view === "auth" ? next : pathFor(view, postId ?? undefined), true);
        })} /> : <button className="btn primary" onClick={() => go("auth")}><KeyRound size={16} />ログイン / 新規登録</button>)}
      </section>
    </div>
    {confirmDelete && <DeleteDialog busy={busy} error={error} title={confirmDelete.kind === "post" ? "この投稿を削除しますか？" : "このコメントを削除しますか？"} onCancel={() => { setConfirmDelete(null); setError(""); }} onConfirm={() => void remove()} />}
  </main>;
}

function Loading() { return <p role="status" className="py-8 text-sm text-[#607063]">読み込み中…</p>; }
function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[#d9a09b] bg-[#fff0ef] p-3 text-sm text-[#943e39]"><p className="break-anywhere flex-1">{message}</p>{onRetry && <button className="btn" onClick={onRetry}><RefreshCw size={16} />再試行</button>}</div>; }
function PostMeta({ post }: { post: SeedPost }) { return <div className="flex flex-wrap gap-2 text-sm"><span className="rounded-md bg-[#e5eee4] px-2 py-1 text-[#235b3b]">{post.category}</span><span className={`status-badge ${post.status === "開発中" ? "developing" : post.status === "公開済み" ? "published" : ""}`}>{post.status}</span></div>; }
function PostCard({ post, onOpen }: { post: SeedPost; onOpen: () => void }) {
  return <article className="rounded-lg border border-[#d7dfd3] bg-white p-4">
    <PostMeta post={post} /><button className="mt-3 w-full text-left" onClick={onOpen}><h3 className="break-anywhere text-lg font-semibold leading-snug">{post.title}</h3></button>
    <p className="break-anywhere mt-2 line-clamp-2 text-sm leading-6 text-[#56665a]">{post.problem}</p><p className="break-anywhere mt-3 text-sm text-[#607063]">{post.author} ・ {dateLabel(post.createdAt)}</p>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{(Object.keys(reactions) as ReactionKey[]).map((key) => { const { Icon, label, count } = reactions[key]; return <span className={`flex items-center gap-1 text-sm ${post.reactions[key] ? "font-semibold text-[#235b3b]" : "text-[#607063]"}`} key={key}><Icon size={15} aria-hidden="true" />{label}<span className="tabular-nums">{post[count]}</span></span>; })}<span className="flex items-center gap-1 text-sm text-[#607063]"><MessageCircle size={15} />{post.commentCount}</span></div>
  </article>;
}
function Pagination({ data, onChange }: { data: Page<unknown>; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  if (pages === 1 && data.page === 1) return null;
  return <nav aria-label="ページ切り替え" className="mt-5 flex items-center justify-center gap-4"><button className="icon-btn" title="前のページ" aria-label="前のページ" disabled={data.page <= 1} onClick={() => onChange(data.page - 1)}><ChevronLeft size={18} /></button><span className="text-sm tabular-nums">{data.page} / {pages}</span><button className="icon-btn" title="次のページ" aria-label="次のページ" disabled={data.page >= pages} onClick={() => onChange(data.page + 1)}><ChevronRight size={18} /></button></nav>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#35453b]">{label}{children}</label>; }
function PostForm({ value, onChange, onSubmit, busy, editing = false }: { value: Draft; onChange: (draft: Draft) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; editing?: boolean }) {
  return <form onSubmit={onSubmit}><h2 className="text-2xl font-semibold">{editing ? "投稿を編集" : "あなたの「ほしい」を残す"}</h2><fieldset disabled={busy} className="mt-5 grid min-w-0 gap-4">
    <Field label="タイトル（必須）"><input className="field" maxLength={120} required value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} /></Field>
    <Field label="どんな困りごと？（必須）"><textarea className="field min-h-28" maxLength={3000} required value={value.problem} onChange={(e) => onChange({ ...value, problem: e.target.value })} /></Field>
    <Field label="どうなったら嬉しい？（必須）"><textarea className="field min-h-28" maxLength={3000} required value={value.desired} onChange={(e) => onChange({ ...value, desired: e.target.value })} /></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="カテゴリ"><select aria-label="カテゴリ" className="field" value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value as Draft["category"] })}>{categories.map((c) => <option key={c}>{c}</option>)}</select></Field><Field label="ステータス"><select aria-label="ステータス" className="field" value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as Draft["status"] })}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></Field></div>
    <Field label="誰が困っている？（任意）"><input className="field" maxLength={500} value={value.targetUser} onChange={(e) => onChange({ ...value, targetUser: e.target.value })} /></Field>
    <Field label="今はどうしている？（任意）"><textarea className="field min-h-20" maxLength={1000} value={value.workaround} onChange={(e) => onChange({ ...value, workaround: e.target.value })} /></Field>
    {value.status === "公開済み" && <Field label="公開URL（任意）"><input type="url" className="field" maxLength={2048} placeholder="https://" value={value.publishedUrl} onChange={(e) => onChange({ ...value, publishedUrl: e.target.value })} /></Field>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.isAnonymous} onChange={(e) => onChange({ ...value, isAnonymous: e.target.checked })} />投稿者名を匿名にする</label>
    <button className="btn primary justify-self-start" type="submit"><Send size={16} />{busy ? "保存中…" : editing ? "変更を保存" : "投稿する"}</button>
  </fieldset></form>;
}
function EditPost({ post, busy, onSubmit }: { post: SeedPost; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>, draft: Draft, current?: SeedPost) => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>({ title: post.title, problem: post.problem, desired: post.desired, category: post.category, targetUser: post.targetUser, workaround: post.workaround, status: post.status, publishedUrl: post.publishedUrl, isAnonymous: post.isAnonymous });
  return <><button className="btn mb-4" disabled={busy} onClick={() => navigate(pathFor("detail", post.id))}><ArrowLeft size={16} />投稿へ戻る</button><PostForm value={draft} onChange={setDraft} editing busy={busy} onSubmit={(e) => void onSubmit(e, draft, post)} /></>;
}
function NicknameForm({ nickname, busy, onSubmit }: { nickname: string; busy: boolean; onSubmit: (nickname: string) => void }) {
  const [value, setValue] = useState(nickname);
  return <form onSubmit={(e) => { e.preventDefault(); onSubmit(value); }}><h2 className="text-2xl font-semibold">Seedleで使うニックネーム</h2><p className="mt-3 text-[#607063]">あとから変更できます。</p><div className="mt-5 max-w-md"><Field label="ニックネーム"><input className="field" maxLength={30} required value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} autoComplete="nickname" /></Field></div><button type="submit" className="btn primary mt-5" disabled={busy}><Check size={16} />{busy ? "保存中…" : "保存する"}</button></form>;
}
function DeleteDialog({ title, busy, error, onCancel, onConfirm }: { title: string; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="delete-dialog" aria-labelledby="delete-title" onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}><h2 id="delete-title" className="text-xl font-semibold">{title}</h2><p className="mt-3 text-sm text-[#607063]">削除すると元に戻せません。</p>{error && <p className="mt-3 text-sm text-[#943e39]" role="alert">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button className="btn" disabled={busy} onClick={onCancel}><X size={16} />キャンセル</button><button className="btn danger" disabled={busy} onClick={onConfirm}><Trash2 size={16} />削除する</button></div></dialog>;
}
