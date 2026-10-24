import { cliArgs } from "../cli.ts";
import { loadPosts, savePosts } from "../store.ts";
import { OembedRateLimitError, fetchAuthor } from "../x/oembed.ts";

const values = cliArgs({
  // 調べ済みの投稿も、もう一度調べる
  all: { type: "boolean", default: false },
  concurrency: { type: "string", default: "4" },
});
const concurrency = Math.max(1, Number(values.concurrency));

const store = await loadPosts();
const targets = Object.values(store.posts).filter((p) => values.all || !p.authorCheckedAt);
if (targets.length === 0) {
  console.log("投稿者をまだ調べていない投稿はありません");
  process.exit(0);
}
console.log(`${targets.length} 件の投稿者を oEmbed で調べます`);

let done = 0;
let found = 0;
let stopped = false;
let next = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function worker() {
  while (!stopped) {
    const post = targets[next++];
    if (!post) return;
    try {
      const author = await fetchAuthor(post.id);
      if (author) {
        post.author = author;
        found++;
      }
      // 消された投稿は調べ直しても取れないので、調べたことだけ記録する
      post.authorCheckedAt = new Date().toISOString();
    } catch (e) {
      if (e instanceof OembedRateLimitError) {
        stopped = true;
        return;
      }
      console.warn(`${post.id}: ${(e as Error).message}`);
    }
    done++;
    if (done % 50 === 0) {
      await savePosts(store);
      console.log(`${done} / ${targets.length} 件を処理`);
    }
    await sleep(250);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
await savePosts(store);
if (stopped) {
  console.error("oEmbed の呼び出し回数の上限に達したので止めました。しばらくしてからもう一度 pnpm x:authors を実行すると、残りを調べます");
  process.exitCode = 1;
}
console.log(`${done} 件を調べ、${found} 件で投稿者が取れました（残りは消された投稿か非公開の投稿）`);
