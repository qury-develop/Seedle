export const categories = ["暮らし", "仕事", "学び", "お店", "健康", "地域"] as const;
export const statuses = ["募集中", "開発中", "公開済み"] as const;
export type Category = (typeof categories)[number];
export type Status = (typeof statuses)[number];
export type ReactionKey = "want" | "build" | "watch";
export type ListMode = "all" | "mine" | "watching" | "building";
export type Viewer = { id: string; nickname: string | null };
export type Draft = {
  title: string; category: Category; problem: string; desired: string;
  targetUser: string; workaround: string; isAnonymous: boolean; status: Status; publishedUrl: string;
};
export type SeedPost = Draft & {
  id: string; author: string; isOwner: boolean; version: number; createdAt: string; updatedAt: string;
  wantCount: number; buildCount: number; watchCount: number; commentCount: number; reactions: Record<ReactionKey, boolean>;
};
export type Comment = { id: string; author: string; body: string; createdAt: string; isOwner: boolean };
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type Feed = Page<SeedPost> & { stats: { posts: number; wants: number; builders: number } };
export const emptyDraft: Draft = {
  title: "", category: "暮らし", problem: "", desired: "", targetUser: "", workaround: "",
  isAnonymous: false, status: "募集中", publishedUrl: "",
};
