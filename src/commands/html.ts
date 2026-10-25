import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCategories, loadHtmlExcluded } from "../categories.ts";
import { OUT_DIR, loadPosts } from "../store.ts";
import { pageData, renderIndexHtml } from "../page.ts";

const categories = await loadCategories();
const posts = Object.values((await loadPosts()).posts);
const excluded = await loadHtmlExcluded();

const data = pageData(categories, posts, excluded);
const updated = new Date().toLocaleString("ja-JP");

const file = path.join(OUT_DIR, "index.html");
await mkdir(OUT_DIR, { recursive: true });
await writeFile(file, renderIndexHtml(data, updated));
console.log(
  `${file} に書き出しました（${data.posts.length} 件、投稿者 ${data.authors.filter((a) => a.handle !== null).length} 人${excluded.size > 0 ? `、外したカテゴリー: ${excluded.size} 個` : ""}）`,
);
