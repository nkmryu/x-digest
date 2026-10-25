import assert from "node:assert/strict";
import { test } from "node:test";
import { pageData, renderIndexHtml } from "./page.ts";
import type { Category, Post } from "./store.ts";

const post = (id: string, over: Partial<Post>): Post => ({ id, text: `本文 ${id}`, urls: [], sources: ["like"], firstSeenAt: "", ...over });
const categories: Category[] = [
  { name: "a", description: "", group: "A" },
  { name: "hidden", description: "", group: "A", excludeFromHtml: true },
  { name: "c", description: "" },
];

test("HTML から外したカテゴリー・分類の無い投稿・解除済みの投稿は出さず、日時の無い投稿はカレンダーにだけ置かない", () => {
  const data = pageData(
    categories,
    [
      post("1", { category: "a", createdAt: "2026-10-24T03:12:00.000Z", author: { name: "A さん", handle: "a_san" } }),
      post("2", { category: "hidden", createdAt: "2026-10-24T03:12:00.000Z" }),
      post("3", { category: "a" }),
      post("4", { createdAt: "2026-10-24T03:12:00.000Z" }),
      post("5", { category: "c", createdAt: "2026-10-23T03:12:00.000Z", sources: ["bookmark", "like"], unlikedAt: "x" }),
      post("6", { category: "c", createdAt: "2026-10-22T03:12:00.000Z", unlikedAt: "x" }),
    ],
    new Set(["hidden"]),
  );
  assert.deepEqual(
    data.posts.map((p) => [p.id, p.cat, p.grp, p.src, p.ah, p.cal?.date ?? null]),
    [
      ["1", "a", "A", "いいね", "a_san", "2026-10-24"],
      ["3", "a", "A", "いいね", null, null],
      ["5", "c", null, "ブックマーク・いいね（解除済み）", null, "2026-10-23"],
    ],
  );
  assert.deepEqual(data.sections, [
    { name: "A", cats: [{ name: "a", ids: ["1", "3"] }] },
    { name: null, cats: [{ name: "c", ids: ["5"] }] },
  ]);
  assert.deepEqual(
    data.authors.map((a) => [a.handle, a.name, a.ids]),
    [
      [null, "投稿者不明", ["5", "3"]],
      ["a_san", "A さん", ["1"]],
    ],
  );
  assert.deepEqual(data.groups, ["A"]);
  assert.deepEqual(data.categories, [
    { name: "a", group: "A" },
    { name: "c", group: null },
  ]);
});

test("本文は t.co のリンクを除いた全文で、リンク先・引用元・記事の題名も持つ", () => {
  const data = pageData(
    [{ name: "a", description: "" }],
    [
      post("1", { category: "a", text: "一行目\n二行目 https://t.co/abc", urls: ["https://example.com/x"], refs: [{ type: "quoted", id: "9", text: "引用元" }], articleTitle: "記事名" }),
      post("2", { category: "a", text: "https://t.co/only" }),
    ],
    new Set(),
  );
  assert.deepEqual(
    data.posts.map((p) => [p.tx, p.urls, p.ref, p.art]),
    [
      ["一行目\n二行目", ["https://example.com/x"], { type: "quoted", text: "引用元" }, "記事名"],
      ["", [], null, null],
    ],
  );
});

test("本文や投稿者の名前に </script> や HTML があっても、ページの script を抜け出さず、文字のまま扱う", () => {
  const data = pageData(
    [{ name: "a", description: "" }],
    [post("1", { category: "a", text: "</script><img src=x onerror=alert(1)>", author: { name: "<b>x</b>", handle: "h" } })],
    new Set(),
  );
  const html = renderIndexHtml(data, "更新");
  assert.equal(html.match(/<\/script>/g)?.length, 1);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

test("ページの script は、そのまま JavaScript として読める（テンプレートのエスケープ漏れを止める）", () => {
  const html = renderIndexHtml(pageData([{ name: "a", description: "" }], [post("1", { category: "a" })], new Set()), "更新");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0]!));
});
