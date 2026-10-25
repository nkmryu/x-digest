import type { Post, PostStore, Source } from "../store.ts";
import { getAccessToken } from "./auth.ts";

// X_API_BASE は偽の API サーバーで取得の流れを確かめるときだけ使う
const API = process.env.X_API_BASE || "https://api.x.com/2";

const ENDPOINT: Record<Source, string> = {
  bookmark: "bookmarks",
  like: "liked_tweets",
};

// ブックマークは 100 件にしない。2026-10-24 に試すと、99・100 件では 1 ページが 1 件少なく返った
// ページで next_token が消え、途中で止まった。10・20 件では最後まで続き、どちらも同じ件数になった
const PAGE_SIZE: Record<Source, number> = {
  bookmark: 20,
  like: 100,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// author_id や username の展開は使わない。展開したユーザーが 1 件 $0.010 の
// ユーザーの読み取りとして課金されるかを公式文書で確かめられていないため
const POST_FIELDS = ["created_at", "lang", "entities", "note_post", "article_title"].join(",");

export interface ApiPost {
  id: string;
  text: string;
  created_at?: string;
  lang?: string;
  entities?: { urls?: { expanded_url?: string | null }[] };
  note_post?: { text: string; entities?: { urls?: { expanded_url?: string | null }[] } };
  article_title?: { title?: string };
  referenced_posts?: { type: string; id: string }[];
}

interface Page {
  data?: ApiPost[];
  meta?: { next_token?: string; result_count?: number };
  errors?: unknown[];
}

// 取得を止めても、止めた位置から次回続きを取れるエラー
export class StopFetchingError extends Error {}

export class RateLimitError extends StopFetchingError {
  constructor(readonly resetAt: Date) {
    super(`X API の呼び出し回数の上限に達しました。${resetAt.toLocaleString("ja-JP")} 以降にもう一度実行してください`);
  }
}

export class CreditsDepletedError extends StopFetchingError {
  constructor() {
    super("X API のクレジットが足りません。console.x.com でクレジットを買ってから、もう一度実行してください");
  }
}

export class InvalidPaginationTokenError extends Error {}

async function xRequest<T>(method: "GET" | "DELETE", pathname: string, query: Record<string, string>): Promise<T> {
  const { accessToken } = await getAccessToken();
  const url = new URL(`${API}${pathname}`);
  url.search = new URLSearchParams(query).toString();
  const request = () => fetch(url, { method, headers: { Authorization: `Bearer ${accessToken}` } });
  let res = await request();
  // ブックマークのページ送りの途中で、HTML の 404 が一度だけ返り、やり直すと通ったことがある
  if (res.status === 404 || res.status >= 500) {
    await sleep(3000);
    res = await request();
  }
  if (res.status === 429) {
    const reset = Number(res.headers.get("x-rate-limit-reset"));
    throw new RateLimitError(new Date(Number.isFinite(reset) && reset > 0 ? reset * 1000 : Date.now() + 15 * 60_000));
  }
  if (res.status === 402) throw new CreditsDepletedError();
  if (res.status === 400 && query.pagination_token) {
    throw new InvalidPaginationTokenError(await res.text());
  }
  if (!res.ok) throw new Error(`X API ${method} ${pathname} が失敗しました: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const xGet = <T>(pathname: string, query: Record<string, string>) => xRequest<T>("GET", pathname, query);

/** 自分のいいねを 1 件解除する。like.write の権限が要る */
export async function unlike(userId: string, postId: string): Promise<boolean> {
  const res = await xRequest<{ data?: { liked?: boolean } }>("DELETE", `/users/${userId}/likes/${postId}`, {});
  return res.data?.liked === false;
}

/** 自分のブックマークを 1 件外す。bookmark.write の権限が要る */
export async function unbookmark(userId: string, postId: string): Promise<boolean> {
  const res = await xRequest<{ data?: { bookmarked?: boolean } }>("DELETE", `/users/${userId}/bookmarks/${postId}`, {});
  return res.data?.bookmarked === false;
}

export async function fetchMe(): Promise<{ id: string; username: string }> {
  const res = await xGet<{ data: { id: string; username: string } }>("/users/me", {});
  return res.data;
}

export function fetchPage(source: Source, userId: string, paginationToken?: string): Promise<Page> {
  const query: Record<string, string> = {
    max_results: String(PAGE_SIZE[source]),
    "post.fields": POST_FIELDS,
  };
  if (paginationToken) query.pagination_token = paginationToken;
  return xGet<Page>(`/users/${userId}/${ENDPOINT[source]}`, query);
}

interface LookupResponse {
  data?: ApiPost[];
  includes?: { posts?: ApiPost[] };
  errors?: { resource_id?: string; title?: string }[];
}

/** 投稿を ID でまとめて引き、引用元・返信先の投稿も展開して返す。1 回 100 件まで */
export function lookupWithRefs(ids: string[]): Promise<LookupResponse> {
  return xGet<LookupResponse>("/tweets", {
    ids: ids.join(","),
    "post.fields": "created_at,note_post,article_title",
    expansions: "referenced_posts",
  });
}

export const postText = (api: ApiPost) => api.note_post?.text ?? api.text;

export function toPost(api: ApiPost, source: Source, now: string): Post {
  const urls = (api.note_post?.entities?.urls ?? api.entities?.urls ?? [])
    .map((u) => u.expanded_url)
    .filter((u): u is string => !!u && !/^https?:\/\/(x|twitter)\.com\/.+\/(photo|video)\//.test(u));
  return {
    id: api.id,
    text: postText(api),
    createdAt: api.created_at,
    lang: api.lang,
    urls: [...new Set(urls)],
    sources: [source],
    firstSeenAt: now,
    ...(api.article_title?.title ? { articleTitle: api.article_title.title } : {}),
  };
}

/**
 * 1 ページ分を保存先に足す。sawKnown は、このソースで取得済みの投稿がページに含まれたかを返す。
 * 一覧が新しく追加した順に返る前提で、取得済みに当たればそれより古い分は前回までに取ってあるとみなす。
 * 公式文書は並び順を書いていないため、この前提が崩れると新着を取りこぼす。
 */
export function mergePage(store: PostStore, source: Source, page: ApiPost[], now: string) {
  let added = 0;
  let sawKnown = false;
  for (const api of page) {
    const existing = store.posts[api.id];
    if (existing?.sources.includes(source)) {
      sawKnown = true;
      continue;
    }
    if (existing) {
      existing.sources.push(source);
    } else {
      store.posts[api.id] = toPost(api, source, now);
    }
    added++;
  }
  return { added, sawKnown };
}

export const postUrl = (id: string) => `https://x.com/i/status/${id}`;
