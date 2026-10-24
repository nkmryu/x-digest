import { OTHER } from "../categories.ts";
import { cliArgs } from "../cli.ts";
import { loadPosts, savePosts } from "../store.ts";
import { StopFetchingError, lookupWithRefs, postText } from "../x/api.ts";

const values = cliArgs({ category: { type: "string", default: OTHER } });

const store = await loadPosts();
const targets = Object.values(store.posts).filter((p) => p.category === values.category && !p.refsCheckedAt);
if (targets.length === 0) {
  console.log(`「${values.category}」に、引用元・返信先をまだ取っていない投稿はありません`);
  process.exit(0);
}

let read = 0;
let withRefs = 0;
try {
  for (let i = 0; i < targets.length; i += 100) {
    const batch = targets.slice(i, i + 100);
    const res = await lookupWithRefs(batch.map((p) => p.id));
    const included = new Map((res.includes?.posts ?? []).map((p) => [p.id, p]));
    read += (res.data?.length ?? 0) + included.size;
    const now = new Date().toISOString();
    for (const api of res.data ?? []) {
      const post = store.posts[api.id];
      if (!post) continue;
      if (api.article_title?.title) post.articleTitle = api.article_title.title;
      const refs = (api.referenced_posts ?? []).flatMap((r) => {
        const ref = included.get(r.id);
        return ref ? [{ type: r.type, id: r.id, text: postText(ref) }] : [];
      });
      if (refs.length > 0) {
        post.refs = refs;
        withRefs++;
      }
    }
    // 消された投稿は data に入らず errors に入る。もう一度引いても取れないので、確認済みにする
    for (const post of batch) post.refsCheckedAt = now;
    await savePosts(store);
    console.log(`${Math.min(i + 100, targets.length)} / ${targets.length} 件を処理`);
  }
} catch (e) {
  if (!(e instanceof StopFetchingError)) throw e;
  console.error(e.message);
  process.exitCode = 1;
}

console.log(`引用元・返信先が取れた投稿: ${withRefs} 件`);
// 自分のブックマーク・いいねの一覧ではないため、1 件 $0.005 の読み取りになる。展開した投稿も同じ額で数えた上限
console.log(`読み取った投稿: ${read} 件（展開した投稿も含め 1 件 $0.005 とすると上限 $${(read * 0.005).toFixed(3)}）`);
