# x-digest

X のブックマークといいねを X API で取り、Claude API でカテゴリーに分けて、カテゴリーごとの要約を `out/digest.md` に書き出す。

## 初回の準備

### 1. X のアプリを作る

1. [X Developer Console](https://console.x.com) で、まとめたいアカウントでログインしてアプリを作る。料金は従量課金で、先にクレジットを入れておく
2. アプリの「User authentication settings」で OAuth 2.0 を有効にする
   - App type: **Native App**（public client。Client Secret を使わない）
   - Callback URI: `http://127.0.0.1:8765/callback`
   - Website URL: 任意（自分のプロフィールの URL など）
3. 表示された OAuth 2.0 の **Client ID** を控える

手順 2 の項目名は、以前の Developer Portal での名前で、今の Console の画面では確かめていない。Callback URI に `127.0.0.1` を登録できることも確かめていない。登録できなければ、登録できた URI を `.env` の `X_REDIRECT_URI` に書く（`pnpm x:login` はその URI のホストとポートで待ち受ける）。App type を Web App にした場合は、Client Secret を `X_CLIENT_SECRET` に書く。

自分のデータの読み取り（1 件 $0.001）になるのは、アプリの持ち主と、ログインするアカウントが同じときだけ。別のアカウントで作ったアプリを使うと、1 件 $0.005 になる。

### 2. 設定を書く

```
cp .env.example .env
```

`.env` の `X_CLIENT_ID` に Client ID を書く。`ANTHROPIC_API_KEY` の行のコメントを外し、Anthropic の API キーを書く。`ant auth login` を使うなら、この行はコメントのままにする。空の `ANTHROPIC_API_KEY=` も「設定あり」とみなされ、ログイン情報より優先されるため。

### 3. 依存を入れてログインする

```
pnpm install
pnpm x:login
```

ブラウザで X の認可画面が開く。許可すると、トークンが `data/x-token.json` に保存される。更新用トークンで自動で延長するため、次回からログインは要らない。

## 使い方

### 初回

```
pnpm x:fetch --max 300      # 300 件に届いたページの終わりで止める（1 ページ最大 100 件）。--max を外すと全件
pnpm x:propose              # カテゴリーの案を data/categories.proposed.json に出す
```

案から採るものを選んで直し、`data/categories.json` として保存する。

```
pnpm x:classify
pnpm x:digest
```

`--max` で止めた分は、次の `pnpm x:fetch` が新着の後に続きから取る。

取得済みの投稿に当たっても止めずに、最初から最後までたどり直すときは `--full` を付ける。`--source bookmark` か `--source like` で片方だけにできる。

```
pnpm x:fetch --full --source bookmark
```

ブックマークは 20 件ずつ取る。100 件ずつだと、X API が 1 件少ないページを返したところで続きのページ（`next_token`）を返さなくなり、途中で止まった（2026-10-24 に確認）。

### 2 回目から

```
pnpm x:update   # fetch → classify → digest → html
```

- fetch は、取得済みの投稿に当たったところで止める
- classify は、未分類の投稿だけを分類する
- digest は、投稿が増えたカテゴリーだけ要約を作り直す

カテゴリーを変えたいときは `data/categories.json` を直す。一覧から消したカテゴリーの投稿は、次の classify で分類し直す。

今あるカテゴリーを細かく分け直すときは、`pnpm x:propose --category <名前> --category <名前> --count 8〜14` のように、そのカテゴリーの投稿だけで案を出せる。案を `categories.json` に反映して古いカテゴリーを消すと、次の `pnpm x:classify` がその投稿を分け直す。

カテゴリーに `"group": "AI"` のように親グループの名前を付けると、まとめ（`digest.md` と `digest.html`）では同じ group のカテゴリーが 1 つの章にまとまる。親の並びは、ファイルで最初に出てきた順。group の無いカテゴリーは、親なしで最後に並ぶ。分類は group に関係なくカテゴリー単位で行うので、group を付けたり変えたりしても分類し直しは要らない。

カテゴリーを足したときは、今あるカテゴリーの投稿は分類し直さない。「その他」などを分類し直すときは、そのカテゴリーを指定する。

```
pnpm x:refs                        # 「その他」の投稿の引用元・返信先の本文と記事の題名を取る（1 件 $0.005 の読み取り）
pnpm x:classify --recheck その他   # 「その他」だけ分類し直す
pnpm x:classify --all              # 全件を今のカテゴリーで分類し直す
pnpm x:digest
```

`x:refs` は `--category <名前>` でほかのカテゴリーも対象にできる。一度取った投稿は取り直さない。

## ツイートを埋め込んだ形で見る

```
pnpm x:html    # out/digest.html を書き出す（Claude は呼ばない）
pnpm x:serve   # http://127.0.0.1:4173/digest.html で開く
```

- 要約の根拠の投稿を、要約の下に埋め込みで並べる。根拠の番号を押すと、その投稿へ移る
- 根拠の投稿の下に、そのほかの投稿を新しい順に並べる。根拠に出した投稿は 2 度出さない。埋め込みは、スクロールして画面に近づいた分から読み込む
- 埋め込みは X の `widgets.js` を読み込む。開くと、表示した投稿の分だけ X に通信する（`dnt: true` を付けている）
- 消された投稿や非公開の投稿は埋め込めないので、日付と本文の先頭を出したままになる
- `out/calendar.html` も一緒に書き出す。Google カレンダーの週表示のように、横が曜日・縦が時間の枠に投稿を 1 件ずつブロックで置く。週は前後に送れる。ブロックを押すと右側に X の埋め込みを出す。色は親グループで、凡例を押すとそのグループだけに絞れる。いいね・ブックマークをした日時は X API で取れないので、書かれた日時で置いている
- `data/categories.json` のカテゴリーに `"excludeFromHtml": true` を付けると、その章を `digest.html` に出さない（`digest.md` には残る）。「その他」を外すときは `{ "name": "その他", "description": "", "excludeFromHtml": true }` の行を足す（分類には使われない）

## いいねを解除する

X のいいねを、カテゴリーを選んで解除する。2 段階で動かし、確かめた一覧だけを解除する。

```
pnpm x:unlike --category <カテゴリー名>        # 1. 確認モード。data/unlike-plan.txt に一覧を書くだけで、X には何もしない
pnpm x:unlike --apply                         # 2. 一覧の件数を見せ、yes と打ったときだけ解除する
```

- `--category` は何度でも付けられる。ブックマークもしている投稿も対象にする（ブックマークは残る）
- 残したい投稿は、`data/unlike-plan.txt` のその行を消すか、行頭に `#` を付ける。読むのは行頭の ID だけ
- 解除した投稿は、手元の記録とまとめに残し、一覧では「いいね（解除済み）」と出す
- 1 件ごとに記録するので、429 やクレジット不足で止まっても、もう一度 `--apply` すると残りを解除する
- 解除には `like.write` の権限が要る。この機能を足す前にログインしていたら、`pnpm x:login` をやり直す
- 開発者登録の利用目的に「X 上のものを変えない」と書いていたら、使う前に Console で書き直す
- 費用は、料金表にいいね解除の行が無い。近い「Interaction: Delete」は 1 件 $0.010

## 費用の目安

- X API: ブックマーク・いいね 1 件 $0.001。同じ投稿を UTC の同じ日に読み直した分は課金されない。月の上限は 300 万件
- Claude API: 既定のモデルは `claude-opus-5-5`（入力 $4 / 出力 $20、100 万トークンあたり）。`.env` の `CLAUDE_MODEL` で替えられる

## データ

すべて `data/` と `out/` に置く。どちらも `.gitignore` 済み。

| ファイル | 中身 |
|---|---|
| `data/x-token.json` | X のトークン（権限 600） |
| `data/posts.json` | 取った投稿・分類の結果・途中で止めた続きのページ |
| `data/categories.json` | 使うカテゴリー（自分で作る） |
| `data/unlike-plan.txt` | x:unlike の確認モードが書く、解除する投稿の一覧 |
| `data/summaries.json` | カテゴリーごとの要約と、要約に使った投稿の id |
| `out/digest.md` | まとめ |
| `out/digest.html` | ツイートを埋め込んだまとめ |
| `out/calendar.html` | 週ごとのカレンダー |

## 確かめていないこと

- X API が、ブックマーク・いいねを追加した新しい順に返すこと。公式文書に並び順の記載が無い。この前提が崩れると、fetch が新着を取りこぼす
- ブックマークを何件までさかのぼれるか。公式文書に記載が無い
- 投稿者の名前を展開したとき、1 件 $0.010 のユーザーの読み取りとして課金されるか。わからないため、投稿者は取らず、リンクは `https://x.com/i/status/<id>` にしている
