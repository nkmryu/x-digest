import assert from "node:assert/strict";
import { test } from "node:test";
import type { Post, PostStore } from "./store.ts";
import { pruneSource } from "./sync.ts";

const post = (id: string, over: Partial<Post>): Post => ({ id, text: "", urls: [], sources: ["like"], firstSeenAt: "", ...over });
const store = (): PostStore => ({
  posts: {
    a: post("a", {}),
    b: post("b", {}),
    both: post("both", { sources: ["bookmark", "like"] }),
    unliked: post("unliked", { unlikedAt: "2026-10-24T00:00:00.000Z" }),
    bm: post("bm", { sources: ["bookmark"] }),
    unbookmarked: post("unbookmarked", { sources: ["bookmark"], unbookmarkedAt: "2026-10-25T00:00:00.000Z" }),
  },
  sources: {},
});

test("一覧に無かった投稿からソースを外し、ソースが無くなれば記録ごと消す", () => {
  const s = store();
  const result = pruneSource(s, "like", new Set(["a"]));
  assert.deepEqual(result, { removed: ["b", "both"], deleted: ["b"] });
  assert.deepEqual(Object.keys(s.posts).sort(), ["a", "bm", "both", "unbookmarked", "unliked"]);
  assert.deepEqual(s.posts.both!.sources, ["bookmark"]);
});

test("x:unlike で解除したいいねは、一覧に無くても触らない", () => {
  const s = store();
  pruneSource(s, "like", new Set(["a", "b", "both"]));
  assert.deepEqual(s.posts.unliked!.sources, ["like"]);
});

test("ブックマークの一覧は、いいねの記録に影響しない", () => {
  const s = store();
  const result = pruneSource(s, "bookmark", new Set());
  assert.deepEqual(result, { removed: ["both", "bm"], deleted: ["bm"] });
  assert.deepEqual(s.posts.both!.sources, ["like"]);
  assert.deepEqual(s.posts.a!.sources, ["like"]);
});

test("x:unbookmark で外したブックマークは、一覧に無くても触らない", () => {
  const s = store();
  pruneSource(s, "bookmark", new Set(["both", "bm"]));
  assert.deepEqual(s.posts.unbookmarked!.sources, ["bookmark"]);
});
