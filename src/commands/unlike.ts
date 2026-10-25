import { runRemoval } from "../removal.ts";
import { paths } from "../store.ts";
import { unlike } from "../x/api.ts";

await runRemoval({
  source: "like",
  label: "いいね",
  scope: "like.write",
  defaultPlan: paths.unlikePlan,
  // 料金表に「いいねの解除」の行は無い。近い「Interaction: Delete」の額
  pricePerItem: 0.01,
  remove: unlike,
  markRemoved: (post, at) => {
    post.unlikedAt = at;
  },
});
