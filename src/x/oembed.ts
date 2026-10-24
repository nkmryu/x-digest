import type { Author } from "../store.ts";

// X の oEmbed は認証なし・無料で、投稿者の表示名と URL を返す。投稿者を X API の展開で取ると
// ユーザーの読み取り（1 件 $0.010）として課金されるかが公式文書でわからないため、こちらを使う
const OEMBED = "https://publish.twitter.com/oembed";

export interface OembedResponse {
  author_name?: string;
  author_url?: string;
  html?: string;
}

/** oEmbed の応答から投稿者を取り出す。author_url の末尾がアカウントの ID */
export function authorFromOembed(body: OembedResponse | null): Author | null {
  const handle = body?.author_url?.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/?$/)?.[1];
  if (!handle || !body?.author_name) return null;
  return { name: body.author_name, handle };
}

export class OembedRateLimitError extends Error {}

/** 投稿者を返す。消された投稿や非公開の投稿は null */
export async function fetchAuthor(postId: string): Promise<Author | null> {
  const url = `${OEMBED}?omit_script=1&dnt=true&url=${encodeURIComponent(`https://x.com/i/status/${postId}`)}`;
  const res = await fetch(url);
  if (res.status === 429) throw new OembedRateLimitError("oEmbed の呼び出し回数の上限に達しました");
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as OembedResponse | null;
  return authorFromOembed(body);
}
