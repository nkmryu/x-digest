import assert from "node:assert/strict";
import { test } from "node:test";
import type { Post } from "./store.ts";
import { formatPlan, parsePlan, selectTargets } from "./unlike.ts";
import { sourceLabel } from "./view.ts";

const post = (id: string, over: Partial<Post>): Post => ({
  id,
  text: `本文 ${id}`,
  urls: [],
  sources: ["like"],
  firstSeenAt: "",
  ...over,
});

test("指定したカテゴリーの、まだ解除していないいいねだけを新しい順に選ぶ", () => {
  const posts = [
    post("1", { category: "A", createdAt: "2024-01-01" }),
    post("2", { category: "A", createdAt: "2025-01-01", sources: ["bookmark", "like"] }),
    post("3", { category: "A", sources: ["bookmark"] }),
    post("4", { category: "A", unlikedAt: "2026-10-24" }),
    post("5", { category: "B" }),
    post("6", {}),
  ];
  assert.deepEqual(
    selectTargets(posts, { categories: ["A"] }).map((p) => p.id),
    ["2", "1"],
  );
});

test("投稿者の ID でも選べる。@ の有無と大文字小文字は問わず、カテゴリーと両方指定したら両方に合うもの", () => {
  const posts = [
    post("1", { category: "A", author: { name: "Example", handle: "example_user" } }),
    post("2", { category: "B", author: { name: "Example", handle: "Example_User" } }),
    post("3", { category: "A", author: { name: "x", handle: "someone" } }),
    post("4", { category: "A" }),
  ];
  assert.deepEqual(selectTargets(posts, { author: "@EXAMPLE_user" }).map((p) => p.id), ["1", "2"]);
  assert.deepEqual(selectTargets(posts, { author: "example_user", categories: ["A"] }).map((p) => p.id), ["1"]);
});

test("一覧から読むのは行頭の ID だけで、# の行・空行・重なりは読まない", () => {
  const plan = formatPlan([post("10", { category: "A" }), post("11", { category: "A", sources: ["bookmark", "like"] })]);
  assert.match(plan, /\[ブックマークもあり\]/);
  const edited = `${plan}# 12\t残す\n\n10\t重なり\n`;
  assert.deepEqual(parsePlan(edited), ["10", "11"]);
});

test("行を消したり # を付けたりした投稿は、解除の対象から外れる", () => {
  const plan = formatPlan([post("10", { category: "A" }), post("11", { category: "A" }), post("12", { category: "A" })]);
  const edited = plan
    .split("\n")
    .filter((line) => !line.startsWith("11\t"))
    .map((line) => (line.startsWith("12\t") ? `# ${line}` : line))
    .join("\n");
  assert.deepEqual(parsePlan(edited), ["10"]);
});

test("解除したいいねは、一覧で「いいね（解除済み）」と出す", () => {
  assert.equal(sourceLabel(post("1", { sources: ["bookmark", "like"] })), "ブックマーク・いいね");
  assert.equal(sourceLabel(post("1", { sources: ["bookmark", "like"], unlikedAt: "x" })), "ブックマーク・いいね（解除済み）");
});

test("選んだ理由があれば、一覧の行末に付ける", () => {
  const plan = formatPlan([post("10", { category: "A" })], new Map([["10", "食事の\n報告だけ"]]));
  assert.match(plan, /^10\t.* — 食事の 報告だけ$/m);
  assert.deepEqual(parsePlan(plan), ["10"]);
});

test("ブックマークを外す対象は、まだ外していないブックマークだけで、いいねもあれば印を付ける", () => {
  const posts = [
    post("1", { category: "A", sources: ["bookmark"] }),
    post("2", { category: "A", sources: ["bookmark", "like"] }),
    post("3", { category: "A", sources: ["bookmark"], unbookmarkedAt: "2026-10-25T00:00:00.000Z" }),
    post("4", { category: "A", sources: ["like"] }),
  ];
  const targets = selectTargets(posts, { categories: ["A"] }, "bookmark");
  assert.deepEqual(targets.map((p) => p.id), ["1", "2"]);
  const plan = formatPlan(targets, undefined, "bookmark");
  assert.match(plan, /^2\t.*\[いいねもあり\]/m);
  assert.doesNotMatch(plan, /^1\t.*もあり/m);
});
