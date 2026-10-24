import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { loadCategories, OTHER } from "../categories.ts";
import { cliArgs } from "../cli.ts";
import { loadPosts, paths, savePosts } from "../store.ts";
import { formatPlan, parsePlan, selectUnlikeTargets } from "../unlike.ts";
import { StopFetchingError, unlike } from "../x/api.ts";
import { getAccessToken } from "../x/auth.ts";

const values = cliArgs({
  category: { type: "string", multiple: true },
  // アカウントの ID（@ なし）。先に pnpm x:authors で投稿者を調べておく
  author: { type: "string" },
  apply: { type: "boolean", default: false },
  // 確認モードが書く一覧と、--apply で読む一覧。既定は data/unlike-plan.txt。
  // 別の解除を進めている最中は、その一覧を上書きしないよう別のファイルにする
  plan: { type: "string" },
});
const planFile = values.plan ?? paths.unlikePlan;

const store = await loadPosts();

if (!values.apply) {
  // 確認モード: X には何もせず、解除する投稿の一覧を書き出すだけ
  const categories = values.category;
  if (!categories && !values.author) throw new Error("--category か --author で、解除する投稿の条件を指定してください");
  if (categories) {
    const known = new Set([...(await loadCategories()).map((c) => c.name), OTHER]);
    const unknown = categories.filter((c) => !known.has(c));
    if (unknown.length > 0) throw new Error(`カテゴリーがありません: ${unknown.join(", ")}`);
  }
  const posts = Object.values(store.posts);
  if (values.author) {
    const unchecked = posts.filter((p) => p.sources.includes("like") && !p.unlikedAt && !p.authorCheckedAt).length;
    if (unchecked > 0) console.warn(`投稿者をまだ調べていないいいねが ${unchecked} 件あります。pnpm x:authors を先に実行しないと、その分は一覧に入りません`);
  }

  const targets = selectUnlikeTargets(posts, { categories, author: values.author });
  await writeFile(planFile, formatPlan(targets));
  const withBookmark = targets.filter((p) => p.sources.includes("bookmark")).length;
  console.log(`解除する候補: ${targets.length} 件（うちブックマークもあり ${withBookmark} 件）`);
  console.log(`一覧を ${planFile} に書きました。X のいいねはまだ解除していません。`);
  console.log(`残したい投稿の行を消すか、行頭に # を付けてから、pnpm x:unlike --apply${values.plan ? ` --plan ${values.plan}` : ""} で解除してください。`);
  process.exit(0);
}

// 解除モード: 確認モードで書き出し、利用者が確かめた一覧だけを解除する
let plan: string;
try {
  plan = await readFile(planFile, "utf8");
} catch {
  throw new Error(`${planFile} がありません。先に pnpm x:unlike --category <カテゴリー> か pnpm x:pick で一覧を作ってください`);
}
const ids = parsePlan(plan);
const targets = ids.flatMap((id) => {
  const post = store.posts[id];
  return post && post.sources.includes("like") && !post.unlikedAt ? [post] : [];
});
const skipped = ids.length - targets.length;
if (targets.length === 0) {
  console.log("解除する投稿はありません（一覧が空か、すべて解除済みです）");
  process.exit(0);
}

const token = await getAccessToken();
if (!token.scope.split(" ").includes("like.write")) {
  throw new Error("いいねを解除する権限（like.write）がありません。pnpm x:login をやり直してください");
}

console.log(`${planFile} の ${targets.length} 件のいいねを、X で解除します。`);
if (skipped > 0) console.log(`（手元に無い・いいねでない・解除済みの ${skipped} 件は飛ばします）`);
// 料金表に「いいねの解除」の行は無い。近い「Interaction: Delete」の額で示す
console.log(`費用の目安: 1 件 $0.010 とすると $${(targets.length * 0.01).toFixed(2)}`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question("解除してよければ yes と入力してください: ")).trim();
rl.close();
if (answer !== "yes") {
  console.log("解除しませんでした");
  process.exit(0);
}

let done = 0;
let failed = 0;
try {
  for (const post of targets) {
    let ok = false;
    try {
      ok = await unlike(token.userId!, post.id);
    } catch (e) {
      // 429・402 は続けても通らないので止める。消された投稿などの失敗は、その 1 件だけ飛ばす
      if (e instanceof StopFetchingError) throw e;
      console.warn(`${post.id}: ${(e as Error).message}`);
    }
    if (!ok) {
      failed++;
      continue;
    }
    post.unlikedAt = new Date().toISOString();
    done++;
    // 1 件ごとに保存し、途中で止まっても解除した分を記録に残す
    await savePosts(store);
    if (done % 20 === 0) console.log(`${done} / ${targets.length} 件を解除`);
  }
} catch (e) {
  if (!(e instanceof StopFetchingError)) throw e;
  console.error(e.message);
  console.error("もう一度 pnpm x:unlike --apply を実行すると、残りを解除します");
  process.exitCode = 1;
}
console.log(`${done} 件のいいねを解除しました${failed > 0 ? `。${failed} 件は解除できませんでした（もう一度 --apply すると試し直します）` : ""}`);
