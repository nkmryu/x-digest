import assert from "node:assert/strict";
import { test } from "node:test";
import type { Category, Post } from "./store.ts";
import { groupPosts, groupSections } from "./view.ts";

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
