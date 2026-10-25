import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { loadCategories, OTHER } from "./categories.ts";
import { cliArgs } from "./cli.ts";
import { type Post, type Source, isSourceActive, loadPosts, savePosts } from "./store.ts";
import { formatPlan, parsePlan, selectTargets } from "./unlike.ts";
import { StopFetchingError } from "./x/api.ts";
import { getAccessToken } from "./x/auth.ts";

export interface RemovalSpec {
  source: Source;
  // 「いいね」「ブックマーク」
  label: string;
  // 解除に要る OAuth の権限
  scope: string;
  // 確認モードが書き、--apply が読む一覧の既定の場所
  defaultPlan: string;
  // 1 件あたりの費用の目安（公式の料金表の近い行）
  pricePerItem: number;
  // X で 1 件解除する。解除できたら true
  remove: (userId: string, postId: string) => Promise<boolean>;
  // 解除した日時を記録する
  markRemoved: (post: Post, at: string) => void;
}

/**
 * いいね・ブックマークを X で外す 2 段階の流れ。
 * 確認モード: 条件に合う投稿を一覧に書くだけで、X には何もしない。
 * --apply: 利用者が確かめた一覧を読み、yes と打ったときだけ 1 件ずつ外す
 */
export async function runRemoval(spec: RemovalSpec): Promise<void> {
  const values = cliArgs({
    category: { type: "string", multiple: true },
    // アカウントの ID（@ なし）。先に pnpm x:authors で投稿者を調べておく
    author: { type: "string" },
    apply: { type: "boolean", default: false },
    // 確認モードが書く一覧と、--apply で読む一覧。別の解除を進めている最中は、その一覧を上書きしないよう別のファイルにする
    plan: { type: "string" },
  });
  const planFile = values.plan ?? spec.defaultPlan;
  const store = await loadPosts();

  if (!values.apply) {
    const categories = values.category;
    if (!categories && !values.author) throw new Error("--category か --author で、解除する投稿の条件を指定してください");
    if (categories) {
      const known = new Set([...(await loadCategories()).map((c) => c.name), OTHER]);
      const unknown = categories.filter((c) => !known.has(c));
      if (unknown.length > 0) throw new Error(`カテゴリーがありません: ${unknown.join(", ")}`);
    }
    const posts = Object.values(store.posts);
    if (values.author) {
      const unchecked = posts.filter((p) => isSourceActive(p, spec.source) && !p.authorCheckedAt).length;
      if (unchecked > 0) console.warn(`投稿者をまだ調べていない投稿が ${unchecked} 件あります。pnpm x:authors を先に実行しないと、その分は一覧に入りません`);
    }
    const targets = selectTargets(posts, { categories, author: values.author }, spec.source);
    await writeFile(planFile, formatPlan(targets, undefined, spec.source));
    const other = spec.source === "like" ? "bookmark" : "like";
    const withOther = targets.filter((p) => isSourceActive(p, other)).length;
    console.log(`解除する候補: ${targets.length} 件（うち${spec.source === "like" ? "ブックマーク" : "いいね"}もあり ${withOther} 件）`);
    console.log(`一覧を ${planFile} に書きました。X の${spec.label}はまだ解除していません。`);
    console.log(`残したい投稿の行を消すか、行頭に # を付けてから、pnpm x:un${spec.source} --apply${values.plan ? ` --plan ${values.plan}` : ""} で解除してください。`);
    return;
  }

  let plan: string;
  try {
    plan = await readFile(planFile, "utf8");
  } catch {
    throw new Error(`${planFile} がありません。先に確認モード（--category か --author）で一覧を作ってください`);
  }
  const ids = parsePlan(plan);
  const targets = ids.flatMap((id) => {
    const post = store.posts[id];
    return post && isSourceActive(post, spec.source) ? [post] : [];
  });
  const skipped = ids.length - targets.length;
  if (targets.length === 0) {
    console.log("解除する投稿はありません（一覧が空か、すべて解除済みです）");
    return;
  }

  const token = await getAccessToken();
  if (!token.scope.split(" ").includes(spec.scope)) {
    throw new Error(`${spec.label}を解除する権限（${spec.scope}）がありません。pnpm x:login をやり直してください`);
  }

  console.log(`${planFile} の ${targets.length} 件の${spec.label}を、X で解除します。`);
  if (skipped > 0) console.log(`（手元に無い・${spec.label}でない・解除済みの ${skipped} 件は飛ばします）`);
  console.log(`費用の目安: 1 件 $${spec.pricePerItem.toFixed(3)} とすると $${(targets.length * spec.pricePerItem).toFixed(2)}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("解除してよければ yes と入力してください: ")).trim();
  rl.close();
  if (answer !== "yes") {
    console.log("解除しませんでした");
    return;
  }

  let done = 0;
  let failed = 0;
  try {
    for (const post of targets) {
      let ok = false;
      try {
        ok = await spec.remove(token.userId!, post.id);
      } catch (e) {
        // 429・402 は続けても通らないので止める。消された投稿などの失敗は、その 1 件だけ飛ばす
        if (e instanceof StopFetchingError) throw e;
        console.warn(`${post.id}: ${(e as Error).message}`);
      }
      if (!ok) {
        failed++;
        continue;
      }
      spec.markRemoved(post, new Date().toISOString());
      done++;
      // 1 件ごとに保存し、途中で止まっても解除した分を記録に残す
      await savePosts(store);
      if (done % 20 === 0) console.log(`${done} / ${targets.length} 件を解除`);
    }
  } catch (e) {
    if (!(e instanceof StopFetchingError)) throw e;
    console.error(e.message);
    console.error(`もう一度 pnpm x:un${spec.source} --apply を実行すると、残りを解除します`);
    process.exitCode = 1;
  }
  console.log(`${done} 件の${spec.label}を解除しました${failed > 0 ? `。${failed} 件は解除できませんでした（もう一度 --apply すると試し直します）` : ""}`);
}
