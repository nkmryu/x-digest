import assert from "node:assert/strict";
import { test } from "node:test";
import type { PostStore } from "../store.ts";
import { mergePage, toPost } from "./api.ts";

const now = "2026-10-24T00:00:00.000Z";
const empty = (): PostStore => ({ posts: {}, sources: {} });

test("新しい投稿だけを足し、同じソースで取得済みの投稿に当たったことを返す", () => {
  const store = empty();
  mergePage(store, "bookmark", [{ id: "1", text: "a" }], now);
  const result = mergePage(store, "bookmark", [{ id: "2", text: "b" }, { id: "1", text: "a" }], now);
  assert.deepEqual(result, { added: 1, sawKnown: true });
  assert.deepEqual(Object.keys(store.posts).sort(), ["1", "2"]);
});

test("別のソースで取得済みの投稿は、取得済みとみなさずソースを足す", () => {
  const store = empty();
  mergePage(store, "bookmark", [{ id: "1", text: "a" }], now);
  const result = mergePage(store, "like", [{ id: "1", text: "a" }], now);
  assert.deepEqual(result, { added: 1, sawKnown: false });
  assert.deepEqual(store.posts["1"]!.sources, ["bookmark", "like"]);
});

test("ソースを足しても分類の結果は残る", () => {
  const store = empty();
  mergePage(store, "bookmark", [{ id: "1", text: "a" }], now);
  store.posts["1"]!.category = "技術";
  mergePage(store, "like", [{ id: "1", text: "a" }], now);
  assert.equal(store.posts["1"]!.category, "技術");
});

test("長文の投稿は note_post の全文とその URL を使い、投稿の画像・動画の URL は除く", () => {
  const post = toPost(
    {
      id: "1",
      text: "短い本文",
      entities: { urls: [{ expanded_url: "https://short.example" }] },
      note_post: {
        text: "長い全文",
        entities: {
          urls: [
            { expanded_url: "https://example.com/a" },
            { expanded_url: "https://example.com/a" },
            { expanded_url: "https://x.com/someone/status/1/photo/1" },
            { expanded_url: null },
          ],
        },
      },
    },
    "like",
    now,
  );
  assert.equal(post.text, "長い全文");
  assert.deepEqual(post.urls, ["https://example.com/a"]);
});

test("記事の投稿は題名を残す", () => {
  const post = toPost({ id: "1", text: "", article_title: { title: "記事の題" } }, "bookmark", now);
  assert.equal(post.articleTitle, "記事の題");
  assert.equal("articleTitle" in toPost({ id: "2", text: "a" }, "bookmark", now), false);
});
