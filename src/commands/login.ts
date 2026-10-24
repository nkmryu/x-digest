import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { buildAuthorizeUrl, createPkce, exchangeCode, saveToken, xConfig } from "../x/auth.ts";
import { fetchMe } from "../x/api.ts";

const { redirectUri } = xConfig();
const redirect = new URL(redirectUri);
const state = randomBytes(16).toString("hex");
const { verifier, challenge } = createPkce();
const authorizeUrl = buildAuthorizeUrl(state, challenge);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", redirectUri);
  if (url.pathname !== redirect.pathname) {
    res.writeHead(404).end();
    return;
  }
  const finish = (status: number, message: string) => {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" }).end(message);
    server.close();
  };
  if (url.searchParams.get("state") !== state) return finish(400, "state が一致しません。pnpm x:login をやり直してください");
  const error = url.searchParams.get("error");
  if (error) return finish(400, `認可されませんでした: ${error}`);
  const code = url.searchParams.get("code");
  if (!code) return finish(400, "code がありません");
  try {
    // 認可コードは 30 秒で失効するため、受け取ったらすぐに交換する
    const token = await exchangeCode(code, verifier);
    await saveToken(token);
    const me = await fetchMe();
    await saveToken({ ...token, userId: me.id });
    console.log(`@${me.username} でログインしました（権限: ${token.scope}）`);
    finish(200, "ログインしました。このタブを閉じてください");
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
    finish(500, "トークンの交換に失敗しました。ターミナルを確認してください");
  }
});

server.listen(Number(redirect.port || 80), redirect.hostname, () => {
  console.log("ブラウザで X の認可画面を開きます。開かない場合は次の URL を開いてください:");
  console.log(authorizeUrl);
  execFile("open", [authorizeUrl], () => {});
});
