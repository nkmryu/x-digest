import { runRemoval } from "../removal.ts";
import { paths } from "../store.ts";
import { unbookmark } from "../x/api.ts";

await runRemoval({
  source: "bookmark",
  label: "ブックマーク",
  scope: "bookmark.write",
  defaultPlan: paths.unbookmarkPlan,
  // 料金表の「Bookmark」の行は 1 回 $0.005。作成と削除のどちらを指すかは書かれていない
  pricePerItem: 0.005,
  remove: unbookmark,
  markRemoved: (post, at) => {
    post.unbookmarkedAt = at;
  },
});
