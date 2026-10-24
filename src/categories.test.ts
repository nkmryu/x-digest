import assert from "node:assert/strict";
import { test } from "node:test";
import { OTHER, needsClassification, sameIds } from "./categories.ts";
import type { Post } from "./store.ts";

const post = (category?: string): Post => ({ id: "1", text: "", urls: [], sources: ["like"], firstSeenAt: "", category });
const names = new Set(["技術", "仕事"]);

test("未分類と、今の一覧に無いカテゴリーの投稿だけを分類し直す", () => {
  assert.equal(needsClassification(post(), names), true);
  assert.equal(needsClassification(post("消したカテゴリー"), names), true);
  assert.equal(needsClassification(post("技術"), names), false);
  assert.equal(needsClassification(post(OTHER), names), false);
});

test("投稿の集合が同じなら、並び順が違っても同じとみなす", () => {
  assert.equal(sameIds(["1", "2"], ["2", "1"]), true);
  assert.equal(sameIds(["1", "2"], ["1", "3"]), false);
  assert.equal(sameIds(["1"], ["1", "2"]), false);
});
