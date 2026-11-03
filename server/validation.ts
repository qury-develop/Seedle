import { z } from "zod";
import { categories, statuses } from "../lib/contracts";
const text = (max: number) => z.string().trim().min(1, "必須項目を入力してください。").max(max, `${max}文字以内で入力してください。`);
const optionalText = (max: number) => z.string().trim().max(max).default("");
const url = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; }
  catch { return false; }
}, "公開URLはhttps://で始まるURLを入力してください。");
export const postInput = z.object({
  title: text(120), problem: text(3000), desired: text(3000), category: z.enum(categories),
  targetUser: optionalText(500), workaround: optionalText(1000), isAnonymous: z.boolean().default(false),
  status: z.enum(statuses).default("募集中"), publishedUrl: url.default(""),
}).strict();
export const postUpdate = postInput.extend({ version: z.number().int().positive() });
export const nicknameInput = z.object({ nickname: text(30).refine((s) => Array.from(s).every((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127), "改行や制御文字は使えません。") }).strict();
export const commentInput = z.object({ body: text(2000) }).strict();
export const reactionInput = z.object({ active: z.boolean() }).strict();
export const pageInput = z.coerce.number().int().min(1).max(100_000).default(1);
