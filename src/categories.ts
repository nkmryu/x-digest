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

// カテゴリーを後から足したり消したりしても、今の一覧に無い分類の投稿は分類し直す
export function needsClassification(post: Post, names: Set<string>): boolean {
  return !post.category || (post.category !== OTHER && !names.has(post.category));
}

export function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}
