import { cliArgs } from "../cli.ts";
import { loadPosts, savePosts, type Source } from "../store.ts";
import { getAccessToken } from "../x/auth.ts";
import { InvalidPaginationTokenError, StopFetchingError, fetchPage, mergePage } from "../x/api.ts";

const values = cliArgs({
  max: { type: "string" },
  source: { type: "string", multiple: true },
  full: { type: "boolean", default: false },
});
const full = values.full;
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
async function walk(source: Source, start: string | undefined, tally: { added: number }) {
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
    const result = mergePage(store, source, data, new Date().toISOString());
    tally.added += result.added;
    token = page.meta?.next_token;
    await savePosts(store);
    if (result.sawKnown && !full) return undefined;
  } while (token && tally.added < max);
  return token;
}

let stopped = false;
for (const source of sources) {
  const state = (store.sources[source] ??= {});
  // --full は先頭から最後までたどるので、前回止めた続きもその中に入る
  const queue: (string | undefined)[] = full ? [undefined] : [undefined, ...(state.pending ?? [])];
  const pending: string[] = [];
  const tally = { added: 0 };
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
  await savePosts(store);
  console.log(`${source}: ${tally.added} 件を追加${pending.length > 0 ? "（途中で止めました。次回続きを取ります）" : ""}`);
  if (stopped) break;
}

console.log(`読み取った投稿: ${read} 件（自分のデータの読み取りで約 $${(read * 0.001).toFixed(3)}。同じ UTC の日に読み直した分は課金されません）`);
if (stopped) process.exitCode = 1;
