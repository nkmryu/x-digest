import type { PostStore, Source } from "./store.ts";

export interface PruneResult {
  // そのソースを外した投稿の ID
  removed: string[];
  // ソースが無くなり、記録ごと消した投稿の ID
  deleted: string[];
}

/**
 * X の一覧を最後まで読んだ後に、手元にあるのに一覧に無かった投稿から、そのソースを外す。
 * いいねもブックマークも無くなった投稿は、記録ごと消す。
 * x:unlike で解除したいいね（unlikedAt あり）は、一覧に無くて当然なので触らない
 */
export function pruneSource(store: PostStore, source: Source, seen: Set<string>): PruneResult {
  const result: PruneResult = { removed: [], deleted: [] };
  for (const [id, post] of Object.entries(store.posts)) {
    if (!post.sources.includes(source) || seen.has(id)) continue;
    if (source === "like" && post.unlikedAt) continue;
    post.sources = post.sources.filter((s) => s !== source);
    result.removed.push(id);
    if (post.sources.length === 0) {
      delete store.posts[id];
      result.deleted.push(id);
    }
  }
  return result;
}
