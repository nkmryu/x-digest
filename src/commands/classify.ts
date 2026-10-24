import { cliArgs } from "../cli.ts";
import { z } from "zod";
import { OTHER, loadCategories, needsClassification } from "../categories.ts";
import { DATA_NOTE, askJson, renderPosts } from "../claude.ts";
import { loadPosts, savePosts } from "../store.ts";

const values = cliArgs({
  batch: { type: "string", default: "50" },
  // カテゴリーを足した後に「その他」を分類し直すときなどに使う
  recheck: { type: "string" },
  // カテゴリーを足した後に、全件を今の一覧で分け直すときに使う
  all: { type: "boolean", default: false },
});
const batchSize = Number(values.batch);

const categories = await loadCategories();
const names = new Set(categories.map((c) => c.name));
const store = await loadPosts();
const targets = Object.values(store.posts).filter(
  (p) => values.all || needsClassification(p, names) || (values.recheck !== undefined && p.category === values.recheck),
);
if (targets.length === 0) {
  console.log("分類する新着はありません");
  process.exit(0);
}

const allNames = new Set([...names, OTHER]);
// z.enum を使わない。SDK は enum を JSON Schema の制約にせず説明の文に変えて送るため、
// 一覧に無い名前が返ると parse が失敗し、バッチ全体の結果を失う
const Schema = z.object({
  results: z.array(z.object({ id: z.string(), category: z.string().describe("カテゴリー名のどれか 1 つ") })),
});
const system = `あなたは、X の投稿を決められたカテゴリーのどれか 1 つに分けます。${DATA_NOTE}

カテゴリー:
${categories.map((c) => `- ${c.name}: ${c.description}`).join("\n")}
- ${OTHER}: 上のどれにも当てはまらない投稿`;

let done = 0;
for (let i = 0; i < targets.length; i += batchSize) {
  const batch = targets.slice(i, i + batchSize);
  const result = await askJson({
    system,
    prompt: `次の ${batch.length} 件を、それぞれ 1 つのカテゴリーに分けてください。すべての id について結果を返してください。\n\n${renderPosts(batch)}`,
    schema: Schema,
    effort: "low",
  });
  const ids = new Set(batch.map((p) => p.id));
  for (const r of result.results) {
    const post = store.posts[r.id];
    if (post && ids.has(r.id) && allNames.has(r.category)) {
      post.category = r.category;
      done++;
    }
  }
  // バッチごとに保存し、途中で失敗しても分類済みの分を払い直さない
  await savePosts(store);
  console.log(`${Math.min(i + batchSize, targets.length)} / ${targets.length} 件を処理`);
}

const missed = targets.length - done;
console.log(
  `${done} 件を分類しました${
    missed > 0
      ? `。${missed} 件は結果が返らないか一覧に無いカテゴリー名だったため、${values.recheck === undefined && !values.all ? "次回もう一度分類します" : "元のカテゴリーのままです"}`
      : ""
  }`,
);
