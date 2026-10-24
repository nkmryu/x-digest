import type { Post } from "./store.ts";
import { listText } from "./view.ts";
import { postUrl } from "./x/api.ts";

/** 指定したカテゴリーの、まだ解除していないいいねを、新しい順に返す */
export function selectUnlikeTargets(posts: Post[], categories: string[]): Post[] {
  const wanted = new Set(categories);
  return posts
    .filter((p) => p.sources.includes("like") && !p.unlikedAt && p.category !== undefined && wanted.has(p.category))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export const PLAN_HEADER = `# いいねを解除する投稿の一覧（x:unlike が作成）
# 残したい投稿は、その行を消すか、行頭に # を付ける。
# 確かめたら pnpm x:unlike --apply で解除する。行頭の ID だけを読む。
`;

/** 1 行 1 件。行頭の ID の後ろは、確かめるための説明 */
export function formatPlan(posts: Post[]): string {
  const lines = posts.map((p) => {
    const text = listText(p).replace(/\s+/g, " ").trim();
    const short = text.length > 60 ? `${text.slice(0, 60)}…` : text;
    const mark = p.sources.includes("bookmark") ? " [ブックマークもあり]" : "";
    return `${p.id}\t${p.createdAt?.slice(0, 10) ?? "----------"} [${p.category}]${mark} ${short} ${postUrl(p.id)}`;
  });
  return `${PLAN_HEADER}${lines.join("\n")}\n`;
}

/** 行頭が数字の行から ID を取る。# で始まる行と空行は読まない */
export function parsePlan(text: string): string[] {
  const ids = text
    .split("\n")
    .map((line) => /^(\d+)(\s|$)/.exec(line)?.[1])
    .filter((id): id is string => id !== undefined);
  return [...new Set(ids)];
}
