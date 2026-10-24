import assert from "node:assert/strict";
import { test } from "node:test";
import { dropForeignLinks } from "./links.ts";

const url = (id: string) => `https://x.com/i/status/${id}`;

test("カテゴリーに無い投稿へのリンクを外し、その行の番号を振り直す", () => {
  const text = `- 話題 A [1](${url("1")}) [2](${url("999")}) [3](${url("2")})\n- 話題 B [1](${url("3")})`;
  const result = dropForeignLinks(text, new Set(["1", "2", "3"]));
  assert.equal(result.text, `- 話題 A [1](${url("1")}) [2](${url("2")})\n- 話題 B [1](${url("3")})`);
  assert.deepEqual(result.dropped, ["999"]);
});

test("外れが無ければ本文を変えない", () => {
  const text = `概要。\n- 話題 [1](${url("1")}) [2](${url("2")})`;
  assert.deepEqual(dropForeignLinks(text, new Set(["1", "2"])), { text, dropped: [] });
});

test("外れの無い行は、行をまたぐ通し番号も変えない", () => {
  const text = `- 話題 A [1](${url("1")})\n- 話題 B [2](${url("2")}) [3](${url("9")})`;
  const result = dropForeignLinks(text, new Set(["1", "2"]));
  assert.equal(result.text, `- 話題 A [1](${url("1")})\n- 話題 B [1](${url("2")})`);
});

test("行のリンクがすべて外れなら、行末に空白を残さない", () => {
  const result = dropForeignLinks(`- 話題 [1](${url("9")})`, new Set());
  assert.equal(result.text, "- 話題");
});
