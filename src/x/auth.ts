import { createHash, randomBytes } from "node:crypto";
import { paths, readJson, writeJson } from "../store.ts";

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
// like.write は x:unlike、bookmark.write は x:unbookmark で使う
export const SCOPES = ["tweet.read", "users.read", "bookmark.read", "bookmark.write", "like.read", "like.write", "offline.access"];

export interface XToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
  userId?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

export function xConfig() {
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) throw new Error("X_CLIENT_ID が未設定です。.env.example を .env にコピーして書いてください");
  return {
    clientId,
    clientSecret: process.env.X_CLIENT_SECRET || undefined,
    redirectUri: process.env.X_REDIRECT_URI || "http://127.0.0.1:8765/callback",
  };
}

export function createPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(state: string, challenge: string): string {
  const { clientId, redirectUri } = xConfig();
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

async function requestToken(params: Record<string, string>): Promise<XToken> {
  const { clientId, clientSecret } = xConfig();
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams(params);
  // public client（Native App）は client_secret を持てないため、本文に client_id を入れる
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", clientId);
  }
  const res = await fetch(TOKEN_URL, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`トークンの取得に失敗しました: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as TokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    scope: json.scope,
  };
}

export function exchangeCode(code: string, verifier: string): Promise<XToken> {
  return requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: xConfig().redirectUri,
    code_verifier: verifier,
  });
}

export const loadToken = () => readJson<XToken | null>(paths.token, null);
export const saveToken = (token: XToken) => writeJson(paths.token, token, { secret: true });

export async function getAccessToken(): Promise<XToken> {
  const token = await loadToken();
  if (!token) throw new Error("ログインしていません。先に pnpm x:login を実行してください");
  if (Date.now() < token.expiresAt - 60_000) return token;
  if (!token.refreshToken) throw new Error("トークンの期限が切れました。pnpm x:login をやり直してください");
  // 更新用トークンは使うたびに新しいものに替わるため、古い値を残さない
  const refreshed = await requestToken({ grant_type: "refresh_token", refresh_token: token.refreshToken });
  const next = { ...refreshed, refreshToken: refreshed.refreshToken ?? token.refreshToken, userId: token.userId };
  await saveToken(next);
  return next;
}
