import { cliArgs } from "../cli.ts";
import { z } from "zod";
import { DATA_NOTE, askJson, renderPosts } from "../claude.ts";
import { loadPosts, paths, writeJson } from "../store.ts";

const values = cliArgs({ sample: { type: "string", default: "300" } });
const sample = Number(values.sample);

const posts = Object.values((await loadPosts()).posts);
if (posts.length === 0) throw new Error("投稿がありません。先に pnpm x:fetch を実行してください");

// 案を作るには全体の傾向がわかれば足りるため、新しい順に sample 件だけ送る
const picked = posts.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, sample);

const Schema = z.object({
  categories: z.array(
    z.object({
      name: z.string().describe("短い日本語のカテゴリー名"),
      description: z.string().describe("どんな投稿を入れるかの基準を 1 文で"),
      examplePostIds: z.array(z.string()).describe("このカテゴリーに入る投稿の id を 3 件まで"),
    }),
  ),
});

const result = await askJson({
  system: `あなたは、利用者が X でブックマークやいいねをした投稿を整理する手伝いをします。${DATA_NOTE}`,
  prompt: `次の ${picked.length} 件の投稿を読み、利用者の関心の分け方としてカテゴリーの案を 6〜12 個出してください。
- 1 つの投稿がどれか 1 つに入るよう、重なりの少ない分け方にする
- 件数の少ない話題は近いカテゴリーにまとめる
- 「その他」は作らない（どれにも入らない投稿は自動で「その他」に入る）

${renderPosts(picked)}`,
  schema: Schema,
  effort: "medium",
});

await writeJson(paths.proposedCategories, {
  categories: result.categories.map(({ name, description }) => ({ name, description })),
});

for (const c of result.categories) {
  console.log(`- ${c.name}: ${c.description}`);
}
console.log(`\n案を ${paths.proposedCategories} に書きました（${picked.length} 件をもとに作成）。`);
console.log(`採るカテゴリーを選んで直し、${paths.categories} として保存してから pnpm x:classify を実行してください。`);
