import assert from "node:assert/strict";
import { test } from "node:test";
import { authorFromOembed } from "./oembed.ts";

test("oEmbed の author_url の末尾をアカウントの ID として取り出す", () => {
  assert.deepEqual(authorFromOembed({ author_name: "Example Name", author_url: "https://twitter.com/example_user" }), {
    name: "Example Name",
    handle: "example_user",
  });
  assert.deepEqual(authorFromOembed({ author_name: "a", author_url: "https://x.com/a_b_1/" }), { name: "a", handle: "a_b_1" });
});

test("投稿者が取れない応答は null にする", () => {
  assert.equal(authorFromOembed(null), null);
  assert.equal(authorFromOembed({ html: "<p>x</p>" }), null);
  assert.equal(authorFromOembed({ author_name: "a", author_url: "https://example.com/a" }), null);
});
