import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCategories, sameIds } from "../categories.ts";
import { DATA_NOTE, askText, renderPosts } from "../claude.ts";
import { dropForeignLinks } from "../links.ts";
import { type SummaryStore, loadPosts, paths, readJson, writeJson } from "../store.ts";
import { groupPosts, listText, sourceLabel } from "../view.ts";
import { postUrl } from "../x/api.ts";

const categories = await loadCategories();
const posts = Object.values((await loadPosts()).posts);
const summaries = await readJson<SummaryStore>(paths.summaries, {});

const groups = groupPosts(categories, posts);

const unclassified = posts.filter((p) => !p.category).length;
if (unclassified > 0) console.warn(`未分類の投稿が ${unclassified} 件あります。pnpm x:classify を先に実行すると、まとめに入ります`);

for (const group of groups) {
  const ids = group.posts.map((p) => p.id);
  if (summaries[group.name] && sameIds(summaries[group.name]!.postIds, ids)) continue;
  console.log(`要約を作り直します: ${group.name}（${ids.length} 件）`);
  const text = await askText({
    system: `あなたは、利用者が X でブックマークやいいねをした投稿を、カテゴリーごとに要約します。${DATA_NOTE}`,
    prompt: `カテゴリー「${group.name}」の投稿 ${ids.length} 件です。
このカテゴリーで利用者が集めている情報を、日本語の Markdown で要約してください。
- 最初に 2〜3 文の概要
- 続けて、主な話題ごとの箇条書き。各項目の末尾に、根拠の投稿を [1](url) の形で 1〜3 件付ける
- 見出し（#）は使わない

${renderPosts(group.posts)}`,
    effort: "medium",
  });
  summaries[group.name] = { postIds: ids, text, updatedAt: new Date().toISOString() };
  await writeJson(paths.summaries, summaries);
}

// 今のカテゴリーに無い要約は、まとめに出さないため消す
for (const name of Object.keys(summaries)) {
  if (!groups.some((g) => g.name === name)) delete summaries[name];
}
await writeJson(paths.summaries, summaries);

const oneLine = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  const short = flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
  return short.replace(/[[\]<>]/g, "\\$&");
};
const anchor = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-");

const lines = [
  "# X のブックマーク・いいねのまとめ",
  "",
  `更新: ${new Date().toLocaleString("ja-JP")} ／ ${posts.length - unclassified} 件`,
  "",
  ...groups.map((g) => `- [${g.name}](#${anchor(g.name)})（${g.posts.length} 件）`),
];
for (const g of groups) {
  // 保存済みの要約にも効くよう、書き出すときに確かめる
  const { text, dropped } = dropForeignLinks(summaries[g.name]!.text, new Set(g.posts.map((p) => p.id)));
  if (dropped.length > 0) {
    console.warn(`${g.name}: このカテゴリーに無い投稿へのリンクを ${dropped.length} 個外しました（${dropped.join(", ")}）`);
  }
  lines.push(
    "",
    `## ${g.name}`,
    "",
    text,
    "",
    `<details><summary>投稿 ${g.posts.length} 件</summary>`,
    "",
    ...g.posts.map(
      (p) => `- ${p.createdAt?.slice(0, 10) ?? ""} [${oneLine(listText(p))}](${postUrl(p.id)})（${sourceLabel(p)}）`,
    ),
    "",
    "</details>",
  );
}

await mkdir(path.dirname(paths.digest), { recursive: true });
await writeFile(paths.digest, `${lines.join("\n")}\n`);
console.log(`${paths.digest} に書き出しました`);
