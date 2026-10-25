import { cliArgs } from "../cli.ts";
import { loadPosts, savePosts, type Source } from "../store.ts";
import { getAccessToken } from "../x/auth.ts";
import { pruneSource } from "../sync.ts";
import { InvalidPaginationTokenError, StopFetchingError, fetchPage, mergePage } from "../x/api.ts";

const values = cliArgs({
  max: { type: "string" },
  source: { type: "string", multiple: true },
  full: { type: "boolean", default: false },
  // --full と一緒に使う。X の一覧に無くなった投稿を、手元の記録から消す
  prune: { type: "boolean", default: false },
  // --prune と一緒に使う。消さずに、消す対象を表示するだけにする
  "dry-run": { type: "boolean", default: false },
});
const full = values.full;
const prune = values.prune;
const dryRun = values["dry-run"];
if (prune && !full) throw new Error("--prune は --full と一緒に指定してください。一覧を最後まで読まないと、無くなった投稿を見つけられません");
if (dryRun && !prune) throw new Error("--dry-run は --prune と一緒に指定してください");
const max = values.max ? Number(values.max) : Infinity;
const sources = (values.source ?? ["bookmark", "like"]) as Source[];

const { userId } = await getAccessToken();
if (!userId) throw new Error("ユーザー ID がありません。pnpm x:login をやり直してください");

const store = await loadPosts();
let read = 0;

class Interrupted extends Error {
  constructor(readonly cause: StopFetchingError, readonly token: string | undefined) {
    super(cause.message);
  }
}

// 取得済みに当たるか、ページが尽きるか、--max に達するまで取り、続きのページを返す。--full では取得済みに当たっても止めない。
// 続きの区間も「取得済みに当たったら止める」でよい。途中で止めた区間の下は、未取得の分の後に取得済みが続くため
async function walk(source: Source, start: string | undefined, tally: { added: number; seen: Set<string> }) {
  let token = start;
  do {
    let page;
    try {
      page = await fetchPage(source, userId!, token);
    } catch (e) {
      if (e instanceof StopFetchingError) throw new Interrupted(e, token);
      throw e;
    }
    const data = page.data ?? [];
    read += data.length;
    for (const p of data) tally.seen.add(p.id);
    const result = mergePage(store, source, data, new Date().toISOString());
    tally.added += result.added;
    token = page.meta?.next_token;
    await savePosts(store);
    if (result.sawKnown && !full) return undefined;
  } while (token && tally.added < max);
  return token;
}

let stopped = false;
// 一覧を最後まで読めたソースと、その一覧にあった投稿の ID
const completed: { source: Source; seen: Set<string> }[] = [];
for (const source of sources) {
  const state = (store.sources[source] ??= {});
  // --full は先頭から最後までたどるので、前回止めた続きもその中に入る
  const queue: (string | undefined)[] = full ? [undefined] : [undefined, ...(state.pending ?? [])];
  const pending: string[] = [];
  const tally = { added: 0, seen: new Set<string>() };
  try {
    while (queue.length > 0) {
      const start = queue.shift();
      if (tally.added >= max) {
        if (start) pending.push(start);
        continue;
      }
      try {
        const rest = await walk(source, start, tally);
        if (rest) pending.push(rest);
      } catch (e) {
        if (!(e instanceof InvalidPaginationTokenError)) throw e;
        console.warn(`${source}: 前回止めた続きのページが使えなくなっていたため、その区間は取れませんでした`);
      }
    }
  } catch (e) {
    if (!(e instanceof Interrupted)) throw e;
    if (e.token) pending.push(e.token);
    pending.push(...queue.filter((t): t is string => !!t));
    console.error(e.message);
    stopped = true;
  }
  state.pending = pending.length > 0 ? pending : undefined;
  // 一覧を最後まで読めたときだけ消す。途中で止まった回に消すと、読んでいない分まで消えてしまう
  if (prune && !stopped && pending.length === 0) completed.push({ source, seen: tally.seen });
  else if (prune) console.warn(`${source}: 一覧を最後まで読めなかったので、無くなった投稿は消していません`);
  await savePosts(store);
  console.log(`${source}: ${tally.added} 件を追加${pending.length > 0 ? "（途中で止めました。次回続きを取ります）" : ""}`);
  if (stopped) break;
}

// 無くなった投稿を消すのは、頼まれたソースを全部読んだ後。ソースごとに消すと、ブックマークからいいねに移した投稿が、
// いいねの一覧を読む前に記録ごと消え、分類と投稿者を失う
if (prune && completed.length === sources.length) {
  // --dry-run は記録を変えずに、消す対象だけを出す
  const target: typeof store = dryRun ? JSON.parse(JSON.stringify(store)) : store;
  for (const { source, seen } of completed) {
    const result = pruneSource(target, source, seen);
    if (!dryRun) {
      console.log(`${source}: X の一覧に無かった ${result.removed.length} 件からこのソースを外し、うち ${result.deleted.length} 件は記録ごと消しました`);
      continue;
    }
    console.log(`${source}: X の一覧に無かった投稿 ${result.removed.length} 件（--dry-run なので消していません）`);
    for (const id of result.removed) {
      const p = store.posts[id]!;
      console.log(`  ${id}\t${p.createdAt?.slice(0, 10) ?? ""}\t[${p.category ?? "未分類"}]\t${p.text.replace(/\s+/g, " ").slice(0, 50)}`);
    }
  }
  if (!dryRun) await savePosts(store);
} else if (prune && completed.length > 0) {
  console.warn("一覧を最後まで読めなかったソースがあるので、無くなった投稿はどのソースでも消していません。次回 --full --prune でやり直してください");
}

console.log(`読み取った投稿: ${read} 件（自分のデータの読み取りで約 $${(read * 0.001).toFixed(3)}。同じ UTC の日に読み直した分は課金されません）`);
if (stopped) process.exitCode = 1;
