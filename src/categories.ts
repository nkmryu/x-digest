import type { Category, CategoryFile, Post } from "./store.ts";
import { paths, readJson } from "./store.ts";

export const OTHER = "その他";

export async function loadCategories(): Promise<Category[]> {
  const file = await readJson<CategoryFile | null>(paths.categories, null);
  if (!file || file.categories.length === 0) {
    throw new Error(`${paths.categories} がありません。pnpm x:propose で案を出し、選んだものを保存してください`);
  }
  return file.categories.filter((c) => c.name !== OTHER);
}

/**
 * x:html で書き出さないカテゴリーの名前。「その他」は分類の一覧に入れない決まりなので、
 * loadCategories の結果ではなく、ファイルの行から直接読む
 */
export async function loadHtmlExcluded(): Promise<Set<string>> {
  const file = await readJson<CategoryFile | null>(paths.categories, null);
  return new Set((file?.categories ?? []).filter((c) => c.excludeFromHtml).map((c) => c.name));
}

// カテゴリーを後から足したり消したりしても、今の一覧に無い分類の投稿は分類し直す
export function needsClassification(post: Post, names: Set<string>): boolean {
  return !post.category || (post.category !== OTHER && !names.has(post.category));
}

export function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}
