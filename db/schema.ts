import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const session = sqliteTable("auth_session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"), userAgent: text("user_agent"),
}, (t) => [index("session_user_idx").on(t.userId)]);
export const account = sqliteTable("auth_account", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"), password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [uniqueIndex("account_provider_idx").on(t.providerId, t.accountId), index("account_user_idx").on(t.userId)]);
export const verification = sqliteTable("auth_verification", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [check("nickname_length", sql`length(${t.nickname}) BETWEEN 1 AND 30`)]);

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  authorId: text("author_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("募集中"),
  problem: text("problem").notNull(),
  desired: text("desired").notNull(),
  targetUser: text("target_user"),
  currentWorkaround: text("current_workaround"),
  isAnonymous: integer("is_anonymous", { mode: "boolean" }).notNull().default(false),
  publishedUrl: text("published_url").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("posts_created_idx").on(t.createdAt, t.id), index("posts_author_idx").on(t.authorId, t.createdAt),
  index("posts_category_idx").on(t.category, t.createdAt),
  check("post_status", sql`${t.status} IN ('募集中','開発中','公開済み')`),
  check("post_category", sql`${t.category} IN ('暮らし','仕事','学び','お店','健康','地域')`),
  check("post_title_length", sql`length(${t.title}) BETWEEN 1 AND 120`),
]);

export const reactions = sqliteTable("reactions", {
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  primaryKey({ columns: [t.postId, t.profileId, t.kind] }), index("reactions_profile_idx").on(t.profileId, t.kind, t.postId),
  check("reaction_kind", sql`${t.kind} IN ('want','build','watch')`),
]);

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("comments_post_idx").on(t.postId, t.createdAt, t.id), check("comment_length", sql`length(${t.body}) BETWEEN 1 AND 2000`)]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), expiresAt: integer("expires_at").notNull(),
}, (t) => [index("rate_limits_expiry_idx").on(t.expiresAt)]);
