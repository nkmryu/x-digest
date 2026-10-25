import type { Post } from "./store.ts";

export interface AuthorSection {
  // 投稿者不明は null
  handle: string | null;
  name: string;
  posts: Post[];
}

const byDateDesc = (a: Post, b: Post) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");

/**
 * 投稿を投稿者ごとにまとめ、投稿の多い順に並べる。同数なら新しい投稿がある人が先。
 * 表示名は一番新しい投稿のもの（X で名前を変える人がいるため）
 */
export function groupByAuthor(posts: Post[]): AuthorSection[] {
  const map = new Map<string | null, Post[]>();
  for (const p of posts) {
    const key = p.author?.handle ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return [...map.entries()]
    .map(([handle, ps]) => {
      ps.sort(byDateDesc);
      return { handle, name: handle === null ? "投稿者不明" : (ps[0]!.author?.name ?? handle), posts: ps };
    })
    .sort((a, b) => b.posts.length - a.posts.length || (b.posts[0]!.createdAt ?? "").localeCompare(a.posts[0]!.createdAt ?? ""));
}
