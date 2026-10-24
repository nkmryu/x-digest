import { OTHER } from "./categories.ts";
import type { Category, Post } from "./store.ts";

export const SOURCE_LABEL = { bookmark: "ブックマーク", like: "いいね" } as const;

/** 一覧に出す「ブックマーク・いいね」。x:unlike で解除したいいねは、そうとわかるようにする */
export const sourceLabel = (p: Post) =>
  p.sources.map((s) => (s === "like" && p.unlikedAt ? "いいね（解除済み）" : SOURCE_LABEL[s])).join("・");

export interface Group {
  name: string;
  posts: Post[];
}

const byDateDesc = (a: Post, b: Post) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");

/** カテゴリーの並び順に、新しい順の投稿をまとめる。投稿の無いカテゴリーは出さない */
export function groupPosts(categories: Category[], posts: Post[]): Group[] {
  return [...categories.map((c) => c.name), OTHER]
    .map((name) => ({ name, posts: posts.filter((p) => p.category === name).sort(byDateDesc) }))
    .filter((g) => g.posts.length > 0);
}

// 本文が空の投稿（記事・画像だけ・引用だけ）も、一覧で何の投稿かわかるようにする
export const listText = (p: Post) =>
  p.text.replace(/https:\/\/t\.co\/\S+/g, "").trim() ||
  (p.articleTitle && `記事: ${p.articleTitle}`) ||
  (p.refs?.[0] && `（引用・返信先）${p.refs[0].text}`) ||
  "（本文なし）";
