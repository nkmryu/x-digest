import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { DATA_NOTE, askJson, renderPosts } from "../claude.ts";
import { cliArgs } from "../cli.ts";
import { loadPosts } from "../store.ts";
import { formatPlan, parsePlan } from "../unlike.ts";

const values = cliArgs({
  // 選ぶ基準。「当てはまる」「当てはまらない」の両方を書くと揺れが減る
  criteria: { type: "string" },
  // 書き出す一覧。x:unlike --apply --plan <このファイル> で解除する
  out: { type: "string", default: "data/pick-plan.txt" },
  // この一覧にある投稿は飛ばす（別の解除を進めている最中など）
  skip: { type: "string", multiple: true },
  batch: { type: "string", default: "50" },
});
if (!values.criteria) throw new Error("--criteria で選ぶ基準を書いてください");
const batchSize = Number(values.batch);

const skip = new Set<string>();
for (const file of values.skip ?? []) for (const id of parsePlan(await readFile(file, "utf8"))) skip.add(id);

const store = await loadPosts();
const targets = Object.values(store.posts)
  .filter((p) => p.sources.includes("like") && !p.unlikedAt && !skip.has(p.id))
  .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
console.log(`いまいいねしている ${targets.length} 件から選びます`);

const Schema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      match: z.boolean().describe("基準に当てはまるなら true"),
      reason: z.string().describe("当てはまると判断した理由を 1 文で。当てはまらないなら空"),
    }),
  ),
});
const system = `あなたは、利用者が X でいいねした投稿のうち、次の基準に当てはまるものを選びます。迷うものは当てはまらない側にします。${DATA_NOTE}

基準:
${values.criteria}`;

const picked = new Map<string, string>();
for (let i = 0; i < targets.length; i += batchSize) {
  const batch = targets.slice(i, i + batchSize);
  const result = await askJson({
    system,
    prompt: `次の ${batch.length} 件について、基準に当てはまるかを判定してください。すべての id について結果を返してください。\n\n${renderPosts(batch)}`,
    schema: Schema,
    effort: "low",
  });
  const ids = new Set(batch.map((p) => p.id));
  for (const r of result.results) if (r.match && ids.has(r.id)) picked.set(r.id, r.reason);
  console.log(`${Math.min(i + batchSize, targets.length)} / ${targets.length} 件を処理（候補 ${picked.size} 件）`);
}

const posts = targets.filter((p) => picked.has(p.id));
await writeFile(values.out, formatPlan(posts, picked));
console.log(`候補 ${posts.length} 件を ${values.out} に書きました。X のいいねはまだ解除していません。`);
console.log(`残したい投稿の行を消すか行頭に # を付けてから、pnpm x:unlike --apply --plan ${values.out} で解除してください。`);
