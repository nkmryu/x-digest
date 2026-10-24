import assert from "node:assert/strict";
import { test } from "node:test";
import { citedIds, summaryToHtml } from "./summary-html.ts";

const url = (id: string) => `https://x.com/i/status/${id}`;

test("段落・入れ子の箇条書き・太字を HTML にする", () => {
  const html = summaryToHtml("概要です。\n\n- **話題 A**：説明\n  - 細目 1\n  - 細目 2\n- 話題 B");
  assert.equal(
    html,
    "<p>概要です。</p><ul><li><strong>話題 A</strong>：説明<ul><li>細目 1</li><li>細目 2</li></ul></li><li>話題 B</li></ul>",
  );
});

test("根拠の投稿へのリンクは、ページ内の埋め込みへのリンクにする", () => {
  const html = summaryToHtml(`- 話題 [1](${url("123")})`);
  assert.equal(html, '<ul><li>話題 <a class="cite" href="#c-123" data-id="123">1</a></li></ul>');
});

test("要約の中の HTML は文字として出し、javascript: のリンクは作らない", () => {
  const html = summaryToHtml('<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror="a">');
  assert.doesNotMatch(html, /<script|<img|href="javascript/);
  assert.match(html, /&lt;script&gt;/);
});

test("ほかのサイトへのリンクは、新しいタブで開くリンクにする", () => {
  const html = summaryToHtml('[記事](https://example.com/a?b=1&c="2")');
  assert.equal(
    html,
    '<p><a href="https://example.com/a?b=1&amp;c=&quot;2&quot;" target="_blank" rel="noopener noreferrer">記事</a></p>',
  );
});

test("根拠の投稿の ID を、出てきた順に重ならないよう返す", () => {
  assert.deepEqual(citedIds(`[1](${url("2")}) [2](${url("1")})\n[1](${url("2")})`), ["2", "1"]);
});
