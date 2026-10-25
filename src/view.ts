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

/**
 * まとめに出す投稿か。いいねを解除してブックマークも無い投稿は、記録には残すが、まとめ・HTML・カレンダーには出さない。
 * ブックマークは外した記録を持たないので、あれば出す
 */
export const isActive = (p: Post) => p.sources.some((s) => s === "bookmark" || (s === "like" && !p.unlikedAt));

/** カテゴリーの並び順に、まとめに出す投稿を新しい順にまとめる。投稿の無いカテゴリーは出さない */
export function groupPosts(categories: Category[], posts: Post[]): Group[] {
  const active = posts.filter(isActive);
  return [...categories.map((c) => c.name), OTHER]
    .map((name) => ({ name, posts: active.filter((p) => p.category === name).sort(byDateDesc) }))
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

/** 投稿を、要約の根拠に挙げた順の cited と、それ以外の rest に分ける。同じ投稿が両方に出ない */
export function partitionCited(posts: Post[], citedIds: string[]): { cited: Post[]; rest: Post[] } {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const cited: Post[] = [];
  for (const id of citedIds) {
    const p = byId.get(id);
    if (p && !seen.has(id)) {
      seen.add(id);
      cited.push(p);
    }
  }
  return { cited, rest: posts.filter((p) => !seen.has(p.id)) };
}

// 本文が空の投稿（記事・画像だけ・引用だけ）も、一覧で何の投稿かわかるようにする
export const listText = (p: Post) =>
  p.text.replace(/https:\/\/t\.co\/\S+/g, "").trim() ||
  (p.articleTitle && `記事: ${p.articleTitle}`) ||
  (p.refs?.[0] && `（引用・返信先）${p.refs[0].text}`) ||
  "（本文なし）";
