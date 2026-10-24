import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const DATA_DIR = "data";
export const OUT_DIR = "out";

export const paths = {
  token: path.join(DATA_DIR, "x-token.json"),
  posts: path.join(DATA_DIR, "posts.json"),
  categories: path.join(DATA_DIR, "categories.json"),
  proposedCategories: path.join(DATA_DIR, "categories.proposed.json"),
  summaries: path.join(DATA_DIR, "summaries.json"),
  unlikePlan: path.join(DATA_DIR, "unlike-plan.txt"),
  digest: path.join(OUT_DIR, "digest.md"),
};

export type Source = "bookmark" | "like";

export interface Post {
  id: string;
  text: string;
  createdAt?: string;
  lang?: string;
  urls: string[];
  sources: Source[];
  firstSeenAt: string;
  category?: string;
  // X の記事（Article）の題名。記事の投稿は本文が空のことがある
  articleTitle?: string;
  // 引用元・返信先の本文。x:refs で取る
  refs?: PostRef[];
  refsCheckedAt?: string;
  // x:unlike で X のいいねを解除した日時。手元の記録とまとめには残す
  unlikedAt?: string;
}

export interface PostRef {
  type: string;
  id: string;
  text: string;
}

export interface SourceState {
  // --max や 429 で途中で止めたページの続き。次回、新着を取った後にここから取る
  pending?: string[];
}

export interface PostStore {
  posts: Record<string, Post>;
  sources: Partial<Record<Source, SourceState>>;
}

export interface Category {
  name: string;
  description: string;
}

export interface CategoryFile {
  categories: Category[];
}

export interface Summary {
  postIds: string[];
  text: string;
  updatedAt: string;
}

export type SummaryStore = Record<string, Summary>;

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

// 途中で落ちても壊れたファイルを残さないよう、一時ファイルに書いてから置き換える
export async function writeJson(file: string, value: unknown, options: { secret?: boolean } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: options.secret ? 0o600 : 0o644 });
  if (options.secret) await chmod(tmp, 0o600);
  await rename(tmp, file);
}

export const loadPosts = () => readJson<PostStore>(paths.posts, { posts: {}, sources: {} });
export const savePosts = (store: PostStore) => writeJson(paths.posts, store);
