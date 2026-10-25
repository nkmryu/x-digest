import assert from "node:assert/strict";
import { test } from "node:test";
import type { Category, Post } from "./store.ts";
import { groupPosts, groupSections, isActive, partitionCited, sourceLabel } from "./view.ts";

const post = (id: string, category: string): Post => ({ id, text: "", urls: [], sources: ["like"], firstSeenAt: "", category });
const categories: Category[] = [
  { name: "a1", description: "", group: "A" },
  { name: "b1", description: "", group: "B" },
  { name: "a2", description: "", group: "A" },
  { name: "c", description: "" },
  { name: "empty", description: "", group: "A" },
];
const posts = [post("1", "a1"), post("2", "b1"), post("3", "a2"), post("4", "c"), post("5", "その他")];

test("親グループは最初に出てきた順に並び、同じ親のカテゴリーはそこにまとまる", () => {
  const sections = groupSections(categories, groupPosts(categories, posts));
  assert.deepEqual(
    sections.map((s) => [s.name, s.groups.map((g) => g.name)]),
    [
      ["A", ["a1", "a2"]],
      ["B", ["b1"]],
      [null, ["c"]],
      [null, ["その他"]],
    ],
  );
});

test("投稿の無いカテゴリーは、親グループにも出ない", () => {
  const sections = groupSections(categories, groupPosts(categories, posts));
  assert.equal(sections.flatMap((s) => s.groups).some((g) => g.name === "empty"), false);
});

test("根拠の投稿は要約の順に並び、残りには出ない。知らない ID と重なる ID は無視する", () => {
  const ps = [post("1", "a"), post("2", "a"), post("3", "a")];
  const { cited, rest } = partitionCited(ps, ["3", "9", "3", "1"]);
  assert.deepEqual(cited.map((p) => p.id), ["3", "1"]);
  assert.deepEqual(rest.map((p) => p.id), ["2"]);
});

test("いいねを解除してブックマークも無い投稿は、まとめに出さない", () => {
  const unliked: Post = { ...post("9", "a1"), unlikedAt: "2026-10-24T00:00:00.000Z" };
  const unlikedButBookmarked: Post = { ...unliked, id: "10", sources: ["bookmark", "like"] };
  assert.equal(isActive(unliked), false);
  assert.equal(isActive(unlikedButBookmarked), true);
  const groups = groupPosts(categories, [...posts, unliked, unlikedButBookmarked]);
  const a1 = groups.find((g) => g.name === "a1")!;
  assert.deepEqual(a1.posts.map((p) => p.id).sort(), ["1", "10"]);
});

test("ブックマークをツールで外した投稿も、いいねが無ければまとめに出さず、印は「ブックマーク（解除済み）」", () => {
  const p: Post = { ...post("11", "a1"), sources: ["bookmark"], unbookmarkedAt: "2026-10-25T00:00:00.000Z" };
  assert.equal(isActive(p), false);
  assert.equal(sourceLabel(p), "ブックマーク（解除済み）");
});
