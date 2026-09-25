"use client";

import {
  ArrowLeft,
  Check,
  Eye,
  Heart,
  Home,
  KeyRound,
  ListFilter,
  MessageCircle,
  Pencil,
  PlusCircle,
  Search,
  Send,
  Sprout,
  UserCircle,
  Wrench,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";

type Category =
  | "暮らし"
  | "仕事"
  | "学び"
  | "お店"
  | "健康"
  | "地域";
type Status = "募集中" | "開発中" | "公開済み";
type View = "list" | "detail" | "compose" | "auth" | "nickname" | "profile";
type ListMode = "all" | "mine" | "watching" | "building";
type SortMode = "hot" | "new";
type ReactionKey = "want" | "build" | "watch";

type Comment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

type SeedPost = {
  id: string;
  title: string;
  category: Category;
  status: Status;
  author: string;
  createdAt: string;
  problem: string;
  desired: string;
  targetUser?: string;
  workaround?: string;
  wantCount: number;
  buildCount: number;
  watchCount: number;
  comments: Comment[];
};

type Draft = {
  title: string;
  problem: string;
  desired: string;
  category: Category;
  targetUser: string;
  workaround: string;
};

type UserState = {
  isSignedIn: boolean;
  nickname: string;
};

const categories: Category[] = [
  "暮らし",
  "仕事",
  "学び",
  "お店",
  "健康",
  "地域",
];

const initialPosts: SeedPost[] = [
  {
    id: "seed-001",
    title: "冷蔵庫の中身から、今夜作れる献立を3つ出してほしい",
    category: "暮らし",
    status: "募集中",
    author: "しおり",
    createdAt: "2026-08-18",
    problem:
      "仕事終わりに買い物へ行く気力がなく、冷蔵庫にある材料だけで何を作れるか考えるのが毎回しんどい。",
    desired:
      "写真かメモを入れるだけで、足りない調味料も含めて現実的な献立を提案してほしい。",
    targetUser: "一人暮らし、共働き家庭、料理に時間をかけにくい人",
    workaround: "レシピサイトで材料名を検索して、近そうなものを組み合わせている。",
    wantCount: 42,
    buildCount: 7,
    watchCount: 18,
    comments: [
      {
        id: "comment-001",
        author: "yuta",
        body: "買い足し候補を100円単位で出してくれるとかなり便利そう。",
        createdAt: "2026-08-19",
      },
    ],
  },
  {
    id: "seed-002",
    title: "小さなお店向けに、雨の日だけ自動でクーポンを出したい",
    category: "お店",
    status: "開発中",
    author: "mori",
    createdAt: "2026-08-16",
    problem:
      "雨の日は来店が落ちるのに、SNS投稿やクーポン配信を毎回手作業でやるのが大変。",
    desired:
      "天気予報と連動して、雨の日の朝だけLINEやInstagram用の文章を作って配信予約したい。",
    targetUser: "個人経営のカフェ、美容室、雑貨店",
    workaround: "天気を見てから手で投稿しているが、忘れる日も多い。",
    wantCount: 31,
    buildCount: 12,
    watchCount: 24,
    comments: [
      {
        id: "comment-002",
        author: "natsu",
        body: "業種ごとのテンプレートがあると導入しやすそうです。",
        createdAt: "2026-08-17",
      },
    ],
  },
  {
    id: "seed-003",
    title: "会議メモから、次に聞くべき質問だけ抜き出してほしい",
    category: "仕事",
    status: "募集中",
    author: "akane",
    createdAt: "2026-08-15",
    problem:
      "商談や打ち合わせのメモは残せるけれど、次回までに確認すべきことを見落としがち。",
    desired:
      "議事録を貼ると、曖昧な点・未決事項・次に聞くべき質問を3分で整理してほしい。",
    targetUser: "営業、PM、フリーランス",
    workaround: "メモを読み返してToDo化している。",
    wantCount: 55,
    buildCount: 15,
    watchCount: 33,
    comments: [],
  },
];

const emptyDraft: Draft = {
  title: "",
  problem: "",
  desired: "",
  category: "暮らし",
  targetUser: "",
  workaround: "",
};

const reactionCopy = {
  want: {
    label: "ほしい",
    activeLabel: "ほしい済み",
    countKey: "wantCount",
    Icon: Heart,
  },
  build: {
    label: "作りたい",
    activeLabel: "作りたい済み",
    countKey: "buildCount",
    Icon: Wrench,
  },
  watch: {
    label: "ウォッチ",
    activeLabel: "ウォッチ中",
    countKey: "watchCount",
    Icon: Eye,
  },
} as const;

export function SeedleApp() {
  const [view, setView] = useState<View>("list");
  const [returnView, setReturnView] = useState<View>("list");
  const [posts, setPosts] = useState(initialPosts);
  const [selectedPostId, setSelectedPostId] = useState(initialPosts[0].id);
  const [mode, setMode] = useState<ListMode>("all");
  const [category, setCategory] = useState<"すべて" | Category>("すべて");
  const [sort, setSort] = useState<SortMode>("hot");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [commentDraft, setCommentDraft] = useState("");
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [user, setUser] = useState<UserState>({
    isSignedIn: false,
    nickname: "",
  });
  const [reactions, setReactions] = useState<
    Record<string, Partial<Record<ReactionKey, boolean>>>
  >({});

  const currentPost = posts.find((post) => post.id === selectedPostId) ?? posts[0];
  const isProfileReady = user.isSignedIn && user.nickname.trim().length > 0;

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return posts
      .filter((post) => {
        const categoryMatches = category === "すべて" || post.category === category;
        const queryMatches =
          normalizedQuery.length === 0 ||
          `${post.title} ${post.problem} ${post.desired}`
            .toLowerCase()
            .includes(normalizedQuery);
        const modeMatches =
          mode === "all" ||
          (mode === "mine" && isProfileReady && post.author === user.nickname) ||
          (mode === "watching" && reactions[post.id]?.watch) ||
          (mode === "building" && reactions[post.id]?.build);

        return categoryMatches && queryMatches && modeMatches;
      })
      .sort((a, b) => {
        if (sort === "new") return b.createdAt.localeCompare(a.createdAt);
        const score = (post: SeedPost) =>
          post.wantCount * 2 + post.buildCount * 3 + post.watchCount;
        return score(b) - score(a);
      });
  }, [category, isProfileReady, mode, posts, query, reactions, sort, user.nickname]);

  const stats = useMemo(
    () => ({
      posts: posts.length,
      wants: posts.reduce((sum, post) => sum + post.wantCount, 0),
      builders: posts.reduce((sum, post) => sum + post.buildCount, 0),
    }),
    [posts],
  );

  function go(nextView: View) {
    setView(nextView);
  }

  function requireProfile(nextView: View) {
    if (!user.isSignedIn) {
      setReturnView(nextView);
      setView("auth");
      return false;
    }
    if (!user.nickname.trim()) {
      setReturnView(nextView);
      setView("nickname");
      return false;
    }
    return true;
  }

  function startGoogleAuth() {
    setUser((current) => ({ ...current, isSignedIn: true }));
    if (!user.nickname.trim()) {
      setNicknameDraft(user.nickname);
      setView("nickname");
      return;
    }
    setView(returnView);
  }

  function saveNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nickname = nicknameDraft.trim();
    if (!nickname) return;
    setUser({ isSignedIn: true, nickname });
    setView(returnView);
  }

  function openPost(postId: string) {
    setSelectedPostId(postId);
    setView("detail");
  }

  function toggleReaction(postId: string, key: ReactionKey) {
    if (!requireProfile(view)) return;

    const countKey = reactionCopy[key].countKey;
    const isActive = Boolean(reactions[postId]?.[key]);
    const delta = isActive ? -1 : 1;

    setReactions((current) => ({
      ...current,
      [postId]: {
        ...current[postId],
        [key]: !isActive,
      },
    }));

    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              [countKey]: Math.max(0, post[countKey] + delta),
            }
          : post,
      ),
    );
  }

  function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireProfile("compose")) return;

    const title = draft.title.trim();
    const problem = draft.problem.trim();
    const desired = draft.desired.trim();
    if (!title || !problem || !desired) return;

    const post: SeedPost = {
      id: `seed-${Date.now()}`,
      title,
      category: draft.category,
      status: "募集中",
      author: user.nickname,
      createdAt: new Date().toISOString().slice(0, 10),
      problem,
      desired,
      targetUser: draft.targetUser.trim() || undefined,
      workaround: draft.workaround.trim() || undefined,
      wantCount: 1,
      buildCount: 0,
      watchCount: 0,
      comments: [],
    };

    setPosts((current) => [post, ...current]);
    setReactions((current) => ({
      ...current,
      [post.id]: { want: true },
    }));
    setDraft(emptyDraft);
    setSelectedPostId(post.id);
    setView("detail");
  }

  function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentPost || !requireProfile("detail")) return;
    const body = commentDraft.trim();
    if (!body) return;

    const comment: Comment = {
      id: `comment-${Date.now()}`,
      author: user.nickname,
      body,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    setPosts((current) =>
      current.map((post) =>
        post.id === currentPost.id
          ? { ...post, comments: [comment, ...post.comments] }
          : post,
      ),
    );
    setCommentDraft("");
  }

  return (
    <main className="min-h-screen bg-[#f3f7f1] text-[#1d2820]">
      <header className="border-b border-[#d9dfd3] bg-[#fbfcf8]/95">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <button
            className="flex items-center gap-3 text-left"
            onClick={() => go("list")}
            type="button"
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#235b3b] text-white">
              <Sprout size={22} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-lg font-semibold tracking-normal">
                Seedle
              </span>
              <span className="block text-xs text-[#607063]">
                小さな「ほしい」を、事業の種に。
              </span>
            </span>
          </button>

          <nav className="flex flex-wrap items-center gap-2">
            <NavButton active={view === "list"} onClick={() => go("list")}>
              <Home size={16} aria-hidden="true" />
              一覧
            </NavButton>
            <NavButton
              active={view === "compose"}
              onClick={() => {
                if (requireProfile("compose")) go("compose");
              }}
            >
              <PlusCircle size={16} aria-hidden="true" />
              投稿
            </NavButton>
            <NavButton
              active={view === "profile"}
              onClick={() => {
                if (requireProfile("profile")) go("profile");
              }}
            >
              <UserCircle size={16} aria-hidden="true" />
              マイページ
            </NavButton>
            {isProfileReady ? (
              <button
                className="flex h-10 items-center gap-2 rounded-lg border border-[#cbd7cb] bg-white px-3 text-sm font-semibold"
                onClick={() => go("profile")}
                type="button"
              >
                <UserCircle size={16} aria-hidden="true" />
                {user.nickname}
              </button>
            ) : (
              <button
                className="flex h-10 items-center gap-2 rounded-lg bg-[#235b3b] px-3 text-sm font-semibold text-white"
                onClick={() => go("auth")}
                type="button"
              >
                <KeyRound size={16} aria-hidden="true" />
                ログイン / 新規登録
              </button>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-[#d7dfd3] bg-white p-4">
            <p className="text-xs font-semibold text-[#2f6f4e]">MVP</p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-normal">
              ほしいの温度が見える場所
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#546357]">
              完璧な企画ではなく、まだ小さな困りごとを投稿して、欲しい人と作りたい人を集めます。
            </p>
            <button
              className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#235b3b] px-3 text-sm font-semibold text-white"
              onClick={() => {
                if (requireProfile("compose")) go("compose");
              }}
              type="button"
            >
              <PlusCircle size={16} aria-hidden="true" />
              ほしいを投稿
            </button>
          </section>

          <section className="grid grid-cols-3 gap-2 rounded-lg border border-[#d7dfd3] bg-white p-3 lg:grid-cols-1">
            <Stat label="投稿" value={stats.posts} />
            <Stat label="ほしい" value={stats.wants} />
            <Stat label="作りたい" value={stats.builders} />
          </section>

          <section className="rounded-lg border border-[#d7dfd3] bg-white p-4">
            <p className="text-sm font-semibold">事業化のステータス</p>
            <div className="mt-3 space-y-3">
              {(["募集中", "開発中", "公開済み"] as Status[]).map((item) => (
                <div className="flex items-center gap-3" key={item}>
                  <span className={statusDotClass(item)} />
                  <span className="text-sm text-[#465549]">{item}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="min-w-0">
          {view === "list" && (
            <ListView
              category={category}
              filteredPosts={filteredPosts}
              mode={mode}
              onCategoryChange={setCategory}
              onModeChange={setMode}
              onOpenPost={openPost}
              onQueryChange={setQuery}
              onSortChange={setSort}
              query={query}
              reactions={reactions}
              sort={sort}
              user={user}
            />
          )}

          {view === "detail" && currentPost && (
            <DetailView
              commentDraft={commentDraft}
              onBack={() => go("list")}
              onCommentDraftChange={setCommentDraft}
              onSubmitComment={addComment}
              onToggleReaction={toggleReaction}
              post={currentPost}
              reactions={reactions[currentPost.id] ?? {}}
            />
          )}

          {view === "compose" && (
            <ComposeView
              draft={draft}
              onDraftChange={setDraft}
              onSubmit={createPost}
            />
          )}

          {view === "auth" && <AuthView onStartGoogle={startGoogleAuth} />}

          {view === "nickname" && (
            <NicknameView
              nicknameDraft={nicknameDraft}
              onNicknameDraftChange={setNicknameDraft}
              onSubmit={saveNickname}
            />
          )}

          {view === "profile" && (
            <ProfileView
              onEditNickname={() => {
                setNicknameDraft(user.nickname);
                setReturnView("profile");
                setView("nickname");
              }}
              onOpenPost={openPost}
              posts={posts}
              reactions={reactions}
              user={user}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function NavButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
        active
          ? "bg-[#dbeadb] text-[#1f5a39]"
          : "border border-[#cbd7cb] bg-white text-[#405145]"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-[#eef5ec] px-3 py-2">
      <p className="text-xs text-[#607063]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ListView({
  category,
  filteredPosts,
  mode,
  onCategoryChange,
  onModeChange,
  onOpenPost,
  onQueryChange,
  onSortChange,
  query,
  reactions,
  sort,
  user,
}: {
  category: "すべて" | Category;
  filteredPosts: SeedPost[];
  mode: ListMode;
  onCategoryChange: (category: "すべて" | Category) => void;
  onModeChange: (mode: ListMode) => void;
  onOpenPost: (postId: string) => void;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: SortMode) => void;
  query: string;
  reactions: Record<string, Partial<Record<ReactionKey, boolean>>>;
  sort: SortMode;
  user: UserState;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#d7dfd3] bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-[#2f6f4e]">
              <ListFilter size={14} aria-hidden="true" />
              投稿一覧
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-normal">
              みんなの小さな「ほしい」
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#778378]"
                size={16}
                aria-hidden="true"
              />
              <input
                className="h-10 w-full rounded-lg border border-[#cbd7cb] bg-[#fbfcf8] pl-9 pr-3 text-sm outline-none focus:border-[#2f6f4e]"
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="困りごとを検索"
                value={query}
              />
            </label>
            <select
              className="h-10 rounded-lg border border-[#cbd7cb] bg-[#fbfcf8] px-3 text-sm"
              onChange={(event) =>
                onCategoryChange(event.target.value as "すべて" | Category)
              }
              value={category}
            >
              <option>すべて</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              className="h-10 rounded-lg border border-[#cbd7cb] bg-[#fbfcf8] px-3 text-sm"
              onChange={(event) => onSortChange(event.target.value as SortMode)}
              value={sort}
            >
              <option value="hot">人気順</option>
              <option value="new">新着順</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <ModeButton active={mode === "all"} onClick={() => onModeChange("all")}>
            すべて
          </ModeButton>
          <ModeButton active={mode === "mine"} onClick={() => onModeChange("mine")}>
            自分の投稿
          </ModeButton>
          <ModeButton
            active={mode === "watching"}
            onClick={() => onModeChange("watching")}
          >
            ウォッチ中
          </ModeButton>
          <ModeButton
            active={mode === "building"}
            onClick={() => onModeChange("building")}
          >
            作りたい
          </ModeButton>
        </div>
      </div>

      {filteredPosts.length > 0 ? (
        <div className="grid gap-3">
          {filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              onOpen={() => onOpenPost(post.id)}
              post={post}
              reactions={reactions[post.id] ?? {}}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[#bccabc] bg-white p-8 text-center">
          <p className="text-sm font-semibold">該当する投稿はまだありません</p>
          <p className="mt-2 text-sm text-[#607063]">
            {user.isSignedIn
              ? "条件を変えるか、新しいほしいを投稿してみてください。"
              : "ログインすると自分の投稿やウォッチ中の投稿を確認できます。"}
          </p>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`h-10 rounded-lg px-3 text-sm font-semibold ${
        active
          ? "bg-[#235b3b] text-white"
          : "border border-[#cbd7cb] bg-[#fbfcf8] text-[#405145]"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function PostCard({
  onOpen,
  post,
  reactions,
}: {
  onOpen: () => void;
  post: SeedPost;
  reactions: Partial<Record<ReactionKey, boolean>>;
}) {
  return (
    <article className="rounded-lg border border-[#d7dfd3] bg-white p-4 transition hover:border-[#91b49a]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[#edf5ef] px-2 py-1 text-xs font-semibold text-[#235b3b]">
              {post.category}
            </span>
            <span className={statusBadgeClass(post.status)}>{post.status}</span>
          </div>
          <button className="mt-3 text-left" onClick={onOpen} type="button">
            <h3 className="text-lg font-semibold leading-snug tracking-normal text-[#17241b]">
              {post.title}
            </h3>
          </button>
          <p className="mt-2 text-sm leading-6 text-[#56665a]">{post.problem}</p>
          <p className="mt-3 text-xs text-[#738075]">
            {post.author} ・ {post.createdAt}
          </p>
        </div>

        <div className="grid min-w-[210px] grid-cols-3 gap-2">
          <CountPill
            active={reactions.want}
            icon={<Heart size={15} aria-hidden="true" />}
            label="ほしい"
            value={post.wantCount}
          />
          <CountPill
            active={reactions.build}
            icon={<Wrench size={15} aria-hidden="true" />}
            label="作りたい"
            value={post.buildCount}
          />
          <CountPill
            active={reactions.watch}
            icon={<Eye size={15} aria-hidden="true" />}
            label="ウォッチ"
            value={post.watchCount}
          />
        </div>
      </div>
    </article>
  );
}

function CountPill({
  active,
  icon,
  label,
  value,
}: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div
      className={`rounded-md px-2 py-2 text-center ${
        active ? "bg-[#dbeadb] text-[#1f5a39]" : "bg-[#f2f5ef] text-[#506052]"
      }`}
    >
      <div className="flex items-center justify-center gap-1">
        {icon}
        <span className="text-sm font-semibold tabular-nums">{value}</span>
      </div>
      <p className="mt-1 text-[11px]">{label}</p>
    </div>
  );
}

function DetailView({
  commentDraft,
  onBack,
  onCommentDraftChange,
  onSubmitComment,
  onToggleReaction,
  post,
  reactions,
}: {
  commentDraft: string;
  onBack: () => void;
  onCommentDraftChange: (value: string) => void;
  onSubmitComment: (event: FormEvent<HTMLFormElement>) => void;
  onToggleReaction: (postId: string, key: ReactionKey) => void;
  post: SeedPost;
  reactions: Partial<Record<ReactionKey, boolean>>;
}) {
  return (
    <div className="space-y-4">
      <button
        className="flex h-10 items-center gap-2 rounded-lg border border-[#cbd7cb] bg-white px-3 text-sm font-semibold"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        一覧へ戻る
      </button>

      <article className="rounded-lg border border-[#d7dfd3] bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[#edf5ef] px-2 py-1 text-xs font-semibold text-[#235b3b]">
            {post.category}
          </span>
          <span className={statusBadgeClass(post.status)}>{post.status}</span>
        </div>

        <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-normal">
          {post.title}
        </h2>
        <p className="mt-2 text-sm text-[#6b796d]">
          {post.author} ・ {post.createdAt}
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <TextBlock title="どんな困りごと？" text={post.problem} />
          <TextBlock title="どうなったら嬉しい？" text={post.desired} />
          {post.targetUser && (
            <TextBlock title="誰が困っている？" text={post.targetUser} />
          )}
          {post.workaround && (
            <TextBlock title="今はどうしている？" text={post.workaround} />
          )}
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {(["want", "build", "watch"] as ReactionKey[]).map((key) => {
            const item = reactionCopy[key];
            const Icon = item.Icon;
            const active = Boolean(reactions[key]);
            return (
              <button
                className={`flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold ${
                  active
                    ? "bg-[#235b3b] text-white"
                    : "border border-[#cbd7cb] bg-[#fbfcf8] text-[#34483a]"
                }`}
                key={key}
                onClick={() => onToggleReaction(post.id, key)}
                type="button"
              >
                <Icon size={16} aria-hidden="true" />
                {active ? item.activeLabel : item.label}
              </button>
            );
          })}
        </div>
      </article>

      <section className="rounded-lg border border-[#d7dfd3] bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <MessageCircle size={18} aria-hidden="true" />
          コメント
        </h3>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={onSubmitComment}
        >
          <textarea
            className="min-h-20 flex-1 rounded-lg border border-[#cbd7cb] bg-[#fbfcf8] p-3 text-sm outline-none focus:border-[#2f6f4e]"
            onChange={(event) => onCommentDraftChange(event.target.value)}
            placeholder="追加の困りごとや作れそうなアイデア"
            value={commentDraft}
          />
          <button
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-[#235b3b] px-4 text-sm font-semibold text-white sm:self-end"
            type="submit"
          >
            <Send size={16} aria-hidden="true" />
            送信
          </button>
        </form>

        <div className="mt-5 space-y-3">
          {post.comments.length > 0 ? (
            post.comments.map((comment) => (
              <div className="rounded-lg bg-[#f2f5ef] p-3" key={comment.id}>
                <p className="text-sm leading-6 text-[#314037]">{comment.body}</p>
                <p className="mt-2 text-xs text-[#6b796d]">
                  {comment.author} ・ {comment.createdAt}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[#607063]">まだコメントはありません。</p>
          )}
        </div>
      </section>
    </div>
  );
}

function TextBlock({ text, title }: { text: string; title: string }) {
  return (
    <section className="rounded-lg bg-[#f7faf4] p-4">
      <h3 className="text-sm font-semibold text-[#235b3b]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#405145]">{text}</p>
    </section>
  );
}

function ComposeView({
  draft,
  onDraftChange,
  onSubmit,
}: {
  draft: Draft;
  onDraftChange: (draft: Draft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="rounded-lg border border-[#d7dfd3] bg-white p-5"
      onSubmit={onSubmit}
    >
      <p className="text-xs font-semibold text-[#2f6f4e]">投稿作成</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-normal">
        あなたの「ほしい」を残す
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#607063]">
        完璧な企画じゃなくて大丈夫。落書きみたいな困りごとから始められます。
      </p>

      <div className="mt-5 grid gap-4">
        <Field label="タイトル">
          <input
            className="field"
            onChange={(event) =>
              onDraftChange({ ...draft, title: event.target.value })
            }
            placeholder="例：雨の日だけクーポンを自動で出したい"
            required
            value={draft.title}
          />
        </Field>
        <Field label="どんな困りごと？">
          <textarea
            className="field min-h-28"
            onChange={(event) =>
              onDraftChange({ ...draft, problem: event.target.value })
            }
            required
            value={draft.problem}
          />
        </Field>
        <Field label="どうなったら嬉しい？">
          <textarea
            className="field min-h-28"
            onChange={(event) =>
              onDraftChange({ ...draft, desired: event.target.value })
            }
            required
            value={draft.desired}
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="カテゴリ">
            <select
              className="field"
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  category: event.target.value as Category,
                })
              }
              value={draft.category}
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="誰が困っている？">
            <input
              className="field"
              onChange={(event) =>
                onDraftChange({ ...draft, targetUser: event.target.value })
              }
              value={draft.targetUser}
            />
          </Field>
        </div>
        <Field label="今はどうしている？">
          <input
            className="field"
            onChange={(event) =>
              onDraftChange({ ...draft, workaround: event.target.value })
            }
            value={draft.workaround}
          />
        </Field>
      </div>

      <button
        className="mt-5 flex h-11 items-center justify-center gap-2 rounded-lg bg-[#235b3b] px-4 text-sm font-semibold text-white"
        type="submit"
      >
        <Send size={16} aria-hidden="true" />
        投稿する
      </button>
    </form>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#35453b]">
      {label}
      {children}
    </label>
  );
}

function AuthView({ onStartGoogle }: { onStartGoogle: () => void }) {
  return (
    <section className="rounded-lg border border-[#d7dfd3] bg-white p-6">
      <p className="text-xs font-semibold text-[#2f6f4e]">ログイン / 新規登録</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-normal">
        Seedleを自分の場所にする
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#607063]">
        Googleアカウントは認証用に使い、Seedle上ではニックネームを表示します。
      </p>
      <button
        className="mt-5 flex h-11 items-center gap-2 rounded-lg bg-[#235b3b] px-4 text-sm font-semibold text-white"
        onClick={onStartGoogle}
        type="button"
      >
        <KeyRound size={16} aria-hidden="true" />
        Googleで続ける
      </button>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {[
          "リアクションできる",
          "コメントできる",
          "自分の投稿を管理できる",
          "ウォッチ中を確認できる",
        ].map((item) => (
          <div
            className="flex items-center gap-2 rounded-lg bg-[#f2f5ef] p-3 text-sm"
            key={item}
          >
            <Check size={16} className="text-[#2f6f4e]" aria-hidden="true" />
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function NicknameView({
  nicknameDraft,
  onNicknameDraftChange,
  onSubmit,
}: {
  nicknameDraft: string;
  onNicknameDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="rounded-lg border border-[#d7dfd3] bg-white p-6"
      onSubmit={onSubmit}
    >
      <p className="text-xs font-semibold text-[#2f6f4e]">ニックネーム登録</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-normal">
        Seedleで使う名前
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#607063]">
        投稿やコメントに表示される名前です。あとから変更できます。
      </p>
      <label className="mt-5 grid max-w-md gap-2 text-sm font-semibold">
        ニックネーム
        <input
          className="field"
          onChange={(event) => onNicknameDraftChange(event.target.value)}
          required
          value={nicknameDraft}
        />
      </label>
      <button
        className="mt-5 flex h-11 items-center gap-2 rounded-lg bg-[#235b3b] px-4 text-sm font-semibold text-white"
        type="submit"
      >
        <Check size={16} aria-hidden="true" />
        登録する
      </button>
    </form>
  );
}

function ProfileView({
  onEditNickname,
  onOpenPost,
  posts,
  reactions,
  user,
}: {
  onEditNickname: () => void;
  onOpenPost: (postId: string) => void;
  posts: SeedPost[];
  reactions: Record<string, Partial<Record<ReactionKey, boolean>>>;
  user: UserState;
}) {
  const ownPosts = posts.filter((post) => post.author === user.nickname);
  const watching = posts.filter((post) => reactions[post.id]?.watch);
  const building = posts.filter((post) => reactions[post.id]?.build);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[#d7dfd3] bg-white p-5">
        <p className="text-xs font-semibold text-[#2f6f4e]">マイページ</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold tracking-normal">{user.nickname}</h2>
          <button
            className="flex h-10 items-center gap-2 rounded-lg border border-[#cbd7cb] bg-[#fbfcf8] px-3 text-sm font-semibold"
            onClick={onEditNickname}
            type="button"
          >
            <Pencil size={16} aria-hidden="true" />
            ニックネーム変更
          </button>
        </div>
      </section>

      <ProfileSection
        empty="自分の投稿はまだありません。"
        onOpenPost={onOpenPost}
        posts={ownPosts}
        title="自分の投稿"
      />
      <ProfileSection
        empty="ウォッチ中の投稿はまだありません。"
        onOpenPost={onOpenPost}
        posts={watching}
        title="ウォッチ中"
      />
      <ProfileSection
        empty="作りたい投稿はまだありません。"
        onOpenPost={onOpenPost}
        posts={building}
        title="作りたい"
      />
    </div>
  );
}

function ProfileSection({
  empty,
  onOpenPost,
  posts,
  title,
}: {
  empty: string;
  onOpenPost: (postId: string) => void;
  posts: SeedPost[];
  title: string;
}) {
  return (
    <section className="rounded-lg border border-[#d7dfd3] bg-white p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="mt-3 grid gap-2">
        {posts.length > 0 ? (
          posts.map((post) => (
            <button
              className="rounded-lg bg-[#f2f5ef] p-3 text-left text-sm font-semibold"
              key={post.id}
              onClick={() => onOpenPost(post.id)}
              type="button"
            >
              {post.title}
            </button>
          ))
        ) : (
          <p className="text-sm text-[#607063]">{empty}</p>
        )}
      </div>
    </section>
  );
}

function statusBadgeClass(status: Status) {
  if (status === "開発中") {
    return "rounded-md bg-[#fff1d7] px-2 py-1 text-xs font-semibold text-[#8a5a13]";
  }
  if (status === "公開済み") {
    return "rounded-md bg-[#e4f0ff] px-2 py-1 text-xs font-semibold text-[#22577a]";
  }
  return "rounded-md bg-[#f4e5df] px-2 py-1 text-xs font-semibold text-[#914832]";
}

function statusDotClass(status: Status) {
  const base = "h-3 w-3 rounded-full";
  if (status === "開発中") return `${base} bg-[#d28a2c]`;
  if (status === "公開済み") return `${base} bg-[#2f7c8a]`;
  return `${base} bg-[#be5b42]`;
}
