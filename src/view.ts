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

export interface Section {
  // null は親グループの無いカテゴリー
  name: string | null;
  groups: Group[];
}

/**
 * カテゴリーの Group を親グループごとにまとめる。親の並びは、カテゴリーの一覧で最初に出てきた順。
 * 親の無いカテゴリーは、それぞれ 1 つの Section として最後に置く
 */
export function groupSections(categories: Category[], groups: Group[]): Section[] {
  const parentOf = new Map(categories.map((c) => [c.name, c.group ?? null]));
  const sections: Section[] = [];
  const parentless: Section[] = [];
  for (const g of groups) {
    const parent = parentOf.get(g.name) ?? null;
    if (parent === null) {
      parentless.push({ name: null, groups: [g] });
      continue;
    }
    let section = sections.find((s) => s.name === parent);
    if (!section) {
      section = { name: parent, groups: [] };
      sections.push(section);
    }
    section.groups.push(g);
  }
  return [...sections, ...parentless];
}

export const sectionCount = (s: Section) => s.groups.reduce((n, g) => n + g.posts.length, 0);

// 本文が空の投稿（記事・画像だけ・引用だけ）も、一覧で何の投稿かわかるようにする
export const listText = (p: Post) =>
  p.text.replace(/https:\/\/t\.co\/\S+/g, "").trim() ||
  (p.articleTitle && `記事: ${p.articleTitle}`) ||
  (p.refs?.[0] && `（引用・返信先）${p.refs[0].text}`) ||
  "（本文なし）";
