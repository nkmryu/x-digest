import type { Post } from "./store.ts";
import { listText } from "./view.ts";
import { postUrl } from "./x/api.ts";

export interface UnlikeFilter {
  categories?: string[];
  // アカウントの ID（@ なし）。大文字小文字は区別しない
  author?: string;
}

/** 条件に合う、まだ解除していないいいねを、新しい順に返す。条件を両方指定したときは両方に合うもの */
export function selectUnlikeTargets(posts: Post[], filter: UnlikeFilter): Post[] {
  const wanted = filter.categories && new Set(filter.categories);
  const handle = filter.author?.replace(/^@/, "").toLowerCase();
  return posts
    .filter((p) => p.sources.includes("like") && !p.unlikedAt)
    .filter((p) => !wanted || (p.category !== undefined && wanted.has(p.category)))
    .filter((p) => !handle || p.author?.handle.toLowerCase() === handle)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export const PLAN_HEADER = `# いいねを解除する投稿の一覧
# 残したい投稿は、その行を消すか、行頭に # を付ける。
# 確かめたら pnpm x:unlike --apply（別のファイルなら --plan <ファイル>）で解除する。行頭の ID だけを読む。
`;

/** 1 行 1 件。行頭の ID の後ろは、確かめるための説明。notes があれば、その投稿を選んだ理由を末尾に付ける */
export function formatPlan(posts: Post[], notes?: Map<string, string>): string {
  const lines = posts.map((p) => {
    const text = listText(p).replace(/\s+/g, " ").trim();
    const short = text.length > 60 ? `${text.slice(0, 60)}…` : text;
    const mark = p.sources.includes("bookmark") ? " [ブックマークもあり]" : "";
    const author = p.author ? ` @${p.author.handle}` : "";
    const note = notes?.get(p.id) ? ` — ${notes.get(p.id)!.replace(/\s+/g, " ")}` : "";
    return `${p.id}\t${p.createdAt?.slice(0, 10) ?? "----------"} [${p.category}]${author}${mark} ${short} ${postUrl(p.id)}${note}`;
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
