import assert from "node:assert/strict";
import { test } from "node:test";
import { groupByAuthor } from "./authors.ts";
import type { Post } from "./store.ts";

const post = (id: string, over: Partial<Post>): Post => ({ id, text: `本文 ${id}`, urls: [], sources: ["like"], firstSeenAt: "", ...over });

test("投稿者ごとに、投稿の多い順にまとめる。表示名は一番新しい投稿のもの。投稿者不明も 1 つにまとめる", () => {
  const posts = [
    post("1", { createdAt: "2026-01-01", author: { name: "古い名前", handle: "a" } }),
    post("2", { createdAt: "2026-02-01", author: { name: "新しい名前", handle: "a" } }),
    post("3", { createdAt: "2026-03-01", author: { name: "B", handle: "b" } }),
    post("4", { createdAt: "2026-02-15" }),
  ];
  const sections = groupByAuthor(posts);
  assert.deepEqual(
    sections.map((s) => [s.handle, s.name, s.posts.map((p) => p.id)]),
    [
      ["a", "新しい名前", ["2", "1"]],
      ["b", "B", ["3"]],
      [null, "投稿者不明", ["4"]],
    ],
  );
});
