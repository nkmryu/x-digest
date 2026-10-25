import { groupByAuthor } from "./authors.ts";
import { WEEKDAYS, calendarCell } from "./calendar.ts";
import type { Category, Post } from "./store.ts";
import { escapeHtml } from "./summary-html.ts";
import { groupPosts, groupSections, sourceLabel } from "./view.ts";

/** ページに埋める 1 投稿。キー名は短くして、JSON の大きさを抑える */
export interface PagePost {
  id: string;
  /** 書かれた日（日本時間ではなく createdAt の先頭 10 文字） */
  date: string;
  /** カレンダーの置き場所。日時の無い投稿は null */
  cal: { week: string; w: number; h: number; m: number } | null;
  cat: string;
  grp: string | null;
  src: string;
  /** 投稿者の表示名と ID。調べていない投稿は null */
  an: string | null;
  ah: string | null;
  /** 本文（t.co のリンクは除く）。リンク先は urls に展開済みのものを持つ */
  tx: string;
  urls: string[];
  /** 引用元・返信先の先頭 1 件 */
  ref: { type: string; text: string } | null;
  /** 記事の題名 */
  art: string | null;
}

export interface PageData {
  posts: PagePost[];
  /** カテゴリーのまとめの章立て。name が null なのは親グループの無いカテゴリー */
  sections: { name: string | null; cats: { name: string; ids: string[] }[] }[];
  /** 投稿者。投稿の多い順。handle が null なのは投稿者不明 */
  authors: { handle: string | null; name: string; ids: string[] }[];
  groups: string[];
  categories: { name: string; group: string | null }[];
  weekdays: string[];
}

/** まとめに出す投稿（HTML から外したカテゴリーを除く）を、1 ページの 3 つの見方で使う形にする */
export function pageData(categories: Category[], posts: Post[], excluded: Set<string>): PageData {
  const groupOf = new Map(categories.map((c) => [c.name, c.group ?? null]));
  const groups = groupPosts(categories, posts).filter((g) => !excluded.has(g.name));
  const shown = groups.flatMap((g) => g.posts);
  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
  return {
    posts: shown.map((p) => {
      const cell = p.createdAt ? calendarCell(p.createdAt) : null;
      return {
        id: p.id,
        date: p.createdAt?.slice(0, 10) ?? "",
        cal: cell && { week: cell.week, w: cell.w, h: cell.h, m: cell.m },
        cat: p.category!,
        grp: groupOf.get(p.category!) ?? null,
        src: sourceLabel(p),
        an: p.author?.name ?? null,
        ah: p.author?.handle ?? null,
        tx: p.text.replace(/https:\/\/t\.co\/\S+/g, "").trim(),
        urls: p.urls,
        ref: p.refs?.[0] ? { type: p.refs[0].type, text: clip(p.refs[0].text, 300) } : null,
        art: p.articleTitle ?? null,
      };
    }),
    sections: groupSections(categories, groups).map((s) => ({
      name: s.name,
      cats: s.groups.map((g) => ({ name: g.name, ids: g.posts.map((p) => p.id) })),
    })),
    authors: groupByAuthor(shown).map((a) => ({ handle: a.handle, name: a.name, ids: a.posts.map((p) => p.id) })),
    groups: [...new Set(categories.flatMap((c) => (c.group && !excluded.has(c.name) ? [c.group] : [])))],
    categories: categories.filter((c) => !excluded.has(c.name)).map((c) => ({ name: c.name, group: c.group ?? null })),
    weekdays: WEEKDAYS,
  };
}

// JSON を <script> に埋めるので、</script> や <!-- で抜け出せないよう < をエスケープする
const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/**
 * 3 つの見方（カテゴリー・投稿者・カレンダー）を上のタブで切り替える 1 ページ。
 * 投稿のデータを JSON で埋め、画面はブラウザで組む。場所は URL の #/<見方>/<章> に持つので、戻る・共有が効く
 */
export function renderIndexHtml(data: PageData, updated: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>X のまとめ</title>
<link rel="preconnect" href="https://platform.twitter.com">
<link rel="preconnect" href="https://cdn.syndication.twimg.com">
<link rel="preconnect" href="https://abs.twimg.com">
<link rel="preconnect" href="https://pbs.twimg.com">
<style>
:root {
  --bg: #f7f7f5; --panel: #ffffff; --text: #1d1d1b; --muted: #6b6b66; --line: #e3e3de; --accent: #1d6fd8;
  --g0: #3b82f6; --g1: #10b981; --g2: #f59e0b; --g3: #a855f7; --g4: #ef4444; --g5: #6b7280;
  --top: 56px; --side: 280px;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #151514; --panel: #1e1e1c; --text: #ecece8; --muted: #9a9a93; --line: #33332f; --accent: #6aa8ff; }
}
* { box-sizing: border-box; }
html { scroll-padding-top: calc(var(--top) + 12px); }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.65 system-ui, -apple-system, "Hiragino Sans", sans-serif; }
a { color: var(--accent); }
button, select, input { font: inherit; font-size: 13px; color: var(--text); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 5px 10px; }
button { cursor: pointer; }
button:disabled { opacity: 0.4; cursor: default; }
.hidden { display: none !important; }
.count { color: var(--muted); font-size: 12px; font-weight: normal; }

/* 上の帯。どの見方からも、ほかの見方へ 1 回で移れる */
.top { position: sticky; top: 0; z-index: 10; min-height: var(--top); display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; padding: 8px 16px; background: var(--bg); border-bottom: 1px solid var(--line); }
.brand { font-weight: 700; font-size: 15px; color: var(--text); text-decoration: none; white-space: nowrap; }
.tabs { display: flex; gap: 2px; padding: 3px; border-radius: 10px; background: color-mix(in srgb, var(--text) 7%, transparent); }
.tabs a { padding: 5px 12px; border-radius: 8px; color: var(--muted); text-decoration: none; font-size: 13px; font-weight: 600; white-space: nowrap; }
.tabs a:hover { color: var(--text); }
.tabs a.on { background: var(--panel); color: var(--text); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
.tabs .badge { font-weight: normal; color: var(--muted); font-size: 11px; margin-left: 4px; }
.search { flex: 1 1 220px; max-width: 440px; display: flex; align-items: center; gap: 8px; }
.search input { flex: 1; min-width: 0; }
.search #hits { color: var(--muted); font-size: 12px; white-space: nowrap; }
.status { margin-left: auto; color: var(--muted); font-size: 12px; white-space: nowrap; }
#menu { display: none; }

/* 見方ごとの枠。左が一覧、右が本文 */
.tab { display: grid; grid-template-columns: var(--side) minmax(0, 1fr); max-width: 1500px; margin: 0 auto; }
.tab[hidden] { display: none; }
.side { position: sticky; top: var(--top); height: calc(100vh - var(--top)); overflow-y: auto; padding: 16px 12px 32px; border-right: 1px solid var(--line); }
.side h2 { font-size: 12px; color: var(--muted); font-weight: 600; margin: 0 0 8px; text-transform: none; }
.side ul { list-style: none; margin: 0; padding: 0; }
.side li { display: flex; justify-content: space-between; gap: 8px; padding: 3px 6px; font-size: 13px; border-left: 2px solid transparent; border-radius: 0 6px 6px 0; }
.side li.group { font-weight: 600; margin-top: 12px; color: var(--text); }
.side li.child { padding-left: 16px; }
.side li.active { border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
.side li.active > a, .side li.group.active { color: var(--accent); }
.side a { color: var(--text); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side a:hover { color: var(--accent); }
.side input[type=search], .side select { width: 100%; margin-bottom: 10px; }
.content { padding: 20px 28px 80px; min-width: 0; }
.group-title { margin: 8px 0 14px; font-size: 20px; }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 20px 24px; margin-bottom: 20px; }
.cat { margin: 0 0 12px; font-size: 18px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.cat .handle { font-size: 13px; font-weight: normal; text-decoration: none; }
.note { color: var(--muted); font-size: 13px; margin: -4px 0 12px; }
.empty { color: var(--muted); text-align: center; padding: 48px 0; }

/* 投稿のカード。手元の本文で組み、X の埋め込みはボタンで読む。頭の行は埋め込みの後も残す */
.tweets { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; align-items: start; }
.card { border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px 12px; min-width: 0; content-visibility: auto; contain-intrinsic-size: auto 240px; }
.card .unembed { display: none; }
.card.embedded .unembed { display: inline; }
.card .head { display: flex; flex-wrap: wrap; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.card .head > * + *::before { content: "・"; margin: 0 5px; color: var(--muted); }
.card .head a { color: var(--accent); text-decoration: none; }
.card .head a:hover { text-decoration: underline; }
.card .author { font-weight: 600; font-size: 14px; }
.card .author span { font-weight: normal; color: var(--muted); margin-left: 6px; font-size: 12px; }
.card .text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.6; margin: 4px 0; }
.card .text.clamp { display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical; overflow: hidden; }
.card .more { border: 0; background: none; color: var(--accent); padding: 0; font-size: 12px; }
.card .ref { margin: 8px 0; padding: 6px 10px; border-left: 3px solid var(--line); color: var(--muted); font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
.card .links a { display: block; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card .foot { display: flex; align-items: center; gap: 12px; margin-top: 8px; font-size: 12px; }
.card .foot button { padding: 3px 10px; font-size: 12px; }
.card.embedded .body, .card.embedded .foot { display: none; }
.card .embed > .twitter-tweet { margin: 0 !important; }
.cat .embed-all { margin-left: auto; padding: 3px 10px; font-size: 12px; font-weight: normal; }

/* カレンダー */
.cal-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-bottom: 12px; }
.cal-bar .week { font-weight: 600; font-size: 15px; }
.cal-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; }
.cal { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
.cal table { border-collapse: collapse; width: 100%; min-width: 820px; table-layout: fixed; }
.cal th { position: sticky; top: var(--top); z-index: 1; background: var(--panel); font-size: 12px; font-weight: 600; padding: 8px 4px; border-bottom: 1px solid var(--line); }
.cal th .d { display: block; color: var(--muted); font-weight: normal; }
.cal th.hour, .cal td.hour { width: 44px; text-align: right; padding-right: 6px; color: var(--muted); font-size: 11px; vertical-align: top; }
.cal td { border-top: 1px solid var(--line); border-left: 1px solid var(--line); vertical-align: top; padding: 2px; height: 28px; }
.ev { display: block; width: 100%; text-align: left; margin: 0 0 2px; padding: 3px 6px; border: 0; border-left: 3px solid var(--c); border-radius: 4px; background: color-mix(in srgb, var(--c) 16%, var(--panel)); color: var(--text); font-size: 11px; line-height: 1.35; cursor: pointer; }
.ev .cat { display: block; font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0; }
.ev .body { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.ev b { font-weight: 600; margin-right: 4px; }
.ev.on { outline: 2px solid var(--text); }
.panel { position: sticky; top: calc(var(--top) + 16px); align-self: start; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; min-height: 200px; }
.panel .card { border: 0; padding: 0; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; color: var(--muted); margin-bottom: 14px; }
.legend span { display: flex; align-items: center; gap: 5px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; background: var(--c); }
.side li.week { font-size: 12px; }
.side li.week.off { opacity: 0.45; }

@media (max-width: 1100px) {
  .cal-wrap { grid-template-columns: 1fr; }
  .panel { position: static; }
}
@media (max-width: 860px) {
  :root { --side: 0px; }
  .status { display: none; }
  #menu { display: inline-block; }
  .tab { grid-template-columns: 1fr; }
  .side { position: fixed; top: var(--top); left: 0; bottom: 0; width: 300px; max-width: 85vw; height: auto; z-index: 9; background: var(--bg); transform: translateX(-100%); transition: transform 0.2s; box-shadow: none; }
  body.side-open .side { transform: none; box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.35); }
  .content { padding: 16px; }
  section { padding: 16px; }
  .tweets { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<header class="top">
  <a class="brand" href="#/categories">X のまとめ</a>
  <nav class="tabs" aria-label="見方">
    <a data-tab="categories" href="#/categories">カテゴリー<span class="badge" id="badge-categories"></span></a>
    <a data-tab="authors" href="#/authors">投稿者<span class="badge" id="badge-authors"></span></a>
    <a data-tab="calendar" href="#/calendar">カレンダー<span class="badge" id="badge-calendar"></span></a>
  </nav>
  <div class="search"><input type="search" id="q" placeholder="本文・投稿者・カテゴリーで絞る（/ でここへ）"><span id="hits"></span></div>
  <button id="menu" type="button">目次</button>
  <div class="status">${data.posts.length.toLocaleString("ja-JP")} 件 ・ ${escapeHtml(updated)} 更新</div>
</header>
<div class="tab" id="tab-categories" hidden><aside class="side"></aside><main class="content"></main></div>
<div class="tab" id="tab-authors" hidden><aside class="side"></aside><main class="content"></main></div>
<div class="tab" id="tab-calendar" hidden><aside class="side"></aside><main class="content"></main></div>
<script>
window.twttr = (function (d, s, id) {
  var js, fjs = d.getElementsByTagName(s)[0], t = window.twttr || {};
  if (d.getElementById(id)) return t;
  js = d.createElement(s); js.id = id; js.async = true; js.src = "https://platform.twitter.com/widgets.js";
  fjs.parentNode.insertBefore(js, fjs);
  t._e = []; t.ready = function (f) { t._e.push(f); };
  return t;
})(document, "script", "twitter-wjs");

// ページの変数を外に出さない
(function () {
"use strict";
var D = ${jsonForScript(data)};
var P = {};
D.posts.forEach(function (p) {
  p.key = [p.tx, p.an || "", p.ah ? "@" + p.ah : "", p.cat].join(" ").toLowerCase();
  P[p.id] = p;
});
var TABS = ["categories", "authors", "calendar"];
var theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
var fmt = function (n) { return n.toLocaleString("ja-JP"); };
var pad = function (n) { return (n < 10 ? "0" : "") + n; };
var byId = function (id) { return document.getElementById(id); };
function el(tag, attrs, text) {
  var e = document.createElement(tag);
  if (attrs) for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}
function href(tab, arg) { return "#/" + tab + (arg ? "/" + encodeURIComponent(arg) : ""); }
function statusUrl(id) { return "https://x.com/i/status/" + id; }

// ---- X の埋め込み。開いた瞬間に出る自前カードを既定にし、埋め込みはボタンで、同時に 4 件まで順に読む
var EMBED_LIMIT = 4, EMBED_TIMEOUT = 30000;
var embedQueue = [], embedRunning = 0;
var embedOpts = { theme: theme, lang: "ja", dnt: true, conversation: "none" };
function setEmbedButton(c, text, disabled) {
  var b = c.querySelector(".embed-btn");
  if (b) { b.textContent = text; b.disabled = disabled; }
}
function requestEmbed(c, first) {
  if (c.dataset.embed) return;
  c.dataset.embed = "queued";
  c.classList.add("embedding");
  setEmbedButton(c, "読み込み中…", true);
  if (first) embedQueue.unshift(c); else embedQueue.push(c);
  pumpEmbeds();
}
function pumpEmbeds() {
  while (embedRunning < EMBED_LIMIT && embedQueue.length > 0) startEmbed(embedQueue.shift());
}
function startEmbed(c) {
  embedRunning++;
  var done = false;
  function finish(w) {
    if (done) return;
    done = true;
    embedRunning--;
    c.classList.remove("embedding");
    c.dataset.embed = w ? "done" : "failed";
    if (w) c.classList.add("embedded"); else setEmbedButton(c, "埋め込みを読めませんでした", true);
    var s = c.closest("section");
    if (s) updateSectionEmbed(s);
    pumpEmbeds();
  }
  // widgets.js が読めないとき（遮断など）に待ち続けないよう、時間で区切る
  var timer = setTimeout(function () { finish(null); }, EMBED_TIMEOUT);
  twttr.ready(function (t) {
    t.widgets.createTweet(c.dataset.id, c.querySelector(".embed"), embedOpts).then(function (w) {
      clearTimeout(timer);
      if (done) { if (w) c.classList.add("embedded"); return; }
      finish(w);
    });
  });
}
// 埋め込み（iframe）はスクロールを重くするので、カードに戻せるようにする
function unembed(c) {
  if (c.classList.contains("embedding")) return;
  c.querySelector(".embed").textContent = "";
  delete c.dataset.embed;
  c.classList.remove("embedded");
  setEmbedButton(c, "埋め込みで見る", false);
  var s = c.closest("section");
  if (s) updateSectionEmbed(s);
}
function updateSectionEmbed(s) {
  var b = s.querySelector(".embed-all");
  if (!b) return;
  var busy = s.querySelectorAll(".card.embedding").length;
  var left = s.querySelectorAll(".card:not([data-embed]):not(.hidden)").length;
  if (busy > 0) { b.disabled = true; b.textContent = "埋め込み中 " + fmt(busy) + " 件"; }
  else if (left === 0) { b.disabled = false; b.textContent = "カードに戻す"; }
  else { b.disabled = false; b.textContent = "この章を埋め込む"; }
}
function toggleSectionEmbed(s) {
  var left = s.querySelectorAll(".card:not([data-embed]):not(.hidden)");
  if (left.length > 0) left.forEach(function (c) { requestEmbed(c, false); });
  else s.querySelectorAll(".card[data-embed]").forEach(unembed);
  updateSectionEmbed(s);
}

// ---- 投稿のカード。頭の行から、ほかの見方のその章へ飛べる（いま居る見方へのリンクは出さない）
var REF_LABEL = { quoted: "引用", replied_to: "返信先", retweeted: "リポスト" };
function card(p, tab) {
  var c = el("article", { class: "card", "data-id": p.id, "data-key": p.key });
  var head = el("div", { class: "head" });
  head.appendChild(el("span", {}, p.date + " ・ " + p.src));
  if (tab !== "authors") head.appendChild(p.ah ? el("a", { href: href("authors", p.ah), title: p.an || "" }, "@" + p.ah) : el("span", {}, "投稿者不明"));
  if (tab !== "categories") head.appendChild(el("a", { href: href("categories", p.cat) }, p.cat));
  var back = el("a", { class: "unembed", href: "#", role: "button" }, "カードに戻す");
  back.addEventListener("click", function (e) { e.preventDefault(); unembed(c); });
  head.appendChild(back);
  c.appendChild(head);
  var body = el("div", { class: "body" });
  if (p.an) {
    var au = el("div", { class: "author" }, p.an);
    au.appendChild(el("span", {}, "@" + p.ah));
    body.appendChild(au);
  }
  var tx = p.tx || (p.ref || p.art ? "" : "（本文なし）");
  if (tx) {
    var long = tx.length > 300 || tx.split("\\n").length > 8;
    var text = el("div", { class: "text" + (long ? " clamp" : "") }, tx);
    body.appendChild(text);
    if (long) {
      var more = el("button", { type: "button", class: "more" }, "続きを読む");
      more.addEventListener("click", function () { more.textContent = text.classList.toggle("clamp") ? "続きを読む" : "たたむ"; });
      body.appendChild(more);
    }
  }
  if (p.art) body.appendChild(el("div", { class: "ref" }, "記事: " + p.art));
  if (p.ref) body.appendChild(el("blockquote", { class: "ref" }, (REF_LABEL[p.ref.type] || p.ref.type) + ": " + p.ref.text));
  if (p.urls.length > 0) {
    var links = el("div", { class: "links" });
    p.urls.forEach(function (u) { links.appendChild(el("a", { href: u, target: "_blank", rel: "noopener noreferrer", title: u }, u.replace(/^https?:\\/\\//, ""))); });
    body.appendChild(links);
  }
  c.appendChild(body);
  var foot = el("div", { class: "foot" });
  foot.appendChild(el("a", { href: statusUrl(p.id), target: "_blank", rel: "noopener noreferrer" }, "X で開く"));
  var btn = el("button", { type: "button", class: "embed-btn" }, "埋め込みで見る");
  btn.addEventListener("click", function () { requestEmbed(c, true); });
  foot.appendChild(btn);
  c.appendChild(foot);
  c.appendChild(el("div", { class: "embed" }));
  return c;
}
function section(t, id, arg, title, count, ids, extra) {
  var s = el("section", { id: id, "data-arg": arg });
  var h = el("h2", { class: "cat" });
  h.appendChild(el("span", {}, title));
  if (extra) extra.forEach(function (x) { h.appendChild(x); });
  h.appendChild(el("span", { class: "count" }, fmt(count) + " 件"));
  var all = el("button", { type: "button", class: "embed-all" }, "この章を埋め込む");
  all.addEventListener("click", function () { toggleSectionEmbed(s); });
  h.appendChild(all);
  s.appendChild(h);
  var grid = el("div", { class: "tweets" });
  ids.forEach(function (pid) { var c = card(P[pid], t.name); t.cards.push(c); grid.appendChild(c); });
  s.appendChild(grid);
  t.sections.push(s);
  return s;
}
function navItem(t, cls, arg, label, count, targetId) {
  var li = el("li", { class: cls, "data-target": targetId });
  li.appendChild(el("a", { href: href(t.name, arg) }, label));
  li.appendChild(el("span", { class: "count" }, fmt(count)));
  t.navOf[targetId] = li;
  return li;
}
function emptyBox(t) {
  t.empty = el("div", { class: "empty" }, "一致する投稿はありません");
  t.empty.hidden = true;
  t.content.appendChild(t.empty);
}

// ---- カテゴリー
function buildCategories(t) {
  var ul = el("ul"), i = 0;
  t.side.appendChild(el("h2", {}, "カテゴリー"));
  D.sections.forEach(function (sec) {
    if (sec.name !== null) {
      var n = sec.cats.reduce(function (a, c) { return a + c.ids.length; }, 0);
      var g = el("li", { class: "group" }, sec.name);
      g.appendChild(el("span", { class: "count" }, fmt(n)));
      ul.appendChild(g);
      var h = el("h2", { class: "group-title" }, sec.name + " ");
      h.appendChild(el("span", { class: "count" }, fmt(n) + " 件"));
      t.content.appendChild(h);
    }
    sec.cats.forEach(function (c) {
      var id = "c-" + (i++);
      ul.appendChild(navItem(t, sec.name !== null ? "child" : "top", c.name, c.name, c.ids.length, id));
      t.content.appendChild(section(t, id, c.name, c.name, c.ids.length, c.ids));
    });
  });
  t.side.appendChild(ul);
  emptyBox(t);
}

// ---- 投稿者。1 件だけの投稿者は 1 つの章にまとめる
function buildAuthors(t) {
  var many = D.authors.filter(function (a) { return a.handle !== null && a.ids.length >= 2; });
  var single = D.authors.filter(function (a) { return a.handle !== null && a.ids.length === 1; });
  var unknown = D.authors.filter(function (a) { return a.handle === null; })[0];
  var people = many.length + single.length;
  var ul = el("ul");
  t.side.appendChild(el("h2", {}, fmt(people) + " 人"));
  many.forEach(function (a, i) {
    var id = "a-" + i;
    ul.appendChild(navItem(t, "top", a.handle, a.name, a.ids.length, id));
    var link = el("a", { class: "handle", href: "https://x.com/" + encodeURIComponent(a.handle), target: "_blank", rel: "noopener noreferrer" }, "@" + a.handle);
    t.content.appendChild(section(t, id, a.handle, a.name, a.ids.length, a.ids, [link]));
  });
  if (single.length > 0) {
    var ids = single.map(function (a) { return a.ids[0]; }).sort(function (x, y) { return P[y].date.localeCompare(P[x].date); });
    ul.appendChild(navItem(t, "group", "single", "1 件だけの投稿者", ids.length, "a-single"));
    t.content.appendChild(section(t, "a-single", "single", "1 件だけの投稿者", ids.length, ids, [el("span", { class: "count" }, fmt(single.length) + " 人")]));
  }
  if (unknown) {
    ul.appendChild(navItem(t, "group", "unknown", "投稿者不明", unknown.ids.length, "a-unknown"));
    var s = section(t, "a-unknown", "unknown", "投稿者不明", unknown.ids.length, unknown.ids);
    s.insertBefore(el("p", { class: "note" }, "消された投稿か非公開の投稿で、投稿者を取れなかったものです。"), s.children[1]);
    t.content.appendChild(s);
  }
  t.side.appendChild(ul);
  emptyBox(t);
}

// ---- カレンダー。週を左の一覧で選び、枠を押すと右に埋め込みを出す
var cal = (function () {
  var entries = D.posts.filter(function (p) { return p.cal; });
  var byWeek = {};
  entries.forEach(function (p) { (byWeek[p.cal.week] = byWeek[p.cal.week] || []).push(p); });
  var weeks = Object.keys(byWeek).sort().reverse();
  var state = { week: null, filter: "", query: "", selected: null };
  var ui = null;
  var groupIndex = function (g) { var i = D.groups.indexOf(g); return i < 0 ? 5 : i; };
  var colorOf = function (g) { return "var(--g" + groupIndex(g) + ")"; };
  function weekLabel(monday) {
    var p = monday.split("-"), end = new Date(Date.UTC(+p[0], p[1] - 1, +p[2] + 6));
    return p[0] + "/" + p[1] + "/" + p[2] + " 〜 " + pad(end.getUTCMonth() + 1) + "/" + pad(end.getUTCDate());
  }
  function dayLabel(monday, w) {
    var p = monday.split("-"), d = new Date(Date.UTC(+p[0], p[1] - 1, +p[2] + w));
    return (d.getUTCMonth() + 1) + "/" + d.getUTCDate();
  }
  function matches(p) {
    if (state.query && p.key.indexOf(state.query) < 0) return false;
    if (state.filter === "") return true;
    return state.filter.slice(0, 2) === "g:" ? p.grp === state.filter.slice(2) : p.cat === state.filter.slice(2);
  }
  function build(t) {
    t.side.appendChild(el("h2", {}, "絞り込み"));
    var sel = el("select");
    sel.appendChild(el("option", { value: "" }, "すべてのカテゴリー"));
    D.groups.forEach(function (g) {
      var og = el("optgroup", { label: g });
      og.appendChild(el("option", { value: "g:" + g }, g + "（すべて）"));
      D.categories.forEach(function (c) { if (c.group === g) og.appendChild(el("option", { value: "c:" + c.name }, c.name)); });
      sel.appendChild(og);
    });
    D.categories.forEach(function (c) { if (c.group === null) sel.appendChild(el("option", { value: "c:" + c.name }, c.name)); });
    sel.addEventListener("change", function () { state.filter = sel.value; render(); });
    t.side.appendChild(sel);
    var legend = el("div", { class: "legend" });
    D.groups.forEach(function (g) {
      var sp = el("span", { style: "--c:" + colorOf(g) });
      sp.appendChild(el("i"));
      sp.appendChild(document.createTextNode(g));
      legend.appendChild(sp);
    });
    t.side.appendChild(legend);
    t.side.appendChild(el("h2", {}, fmt(weeks.length) + " 週"));
    var ul = el("ul");
    weeks.forEach(function (wk) {
      var li = el("li", { class: "week", "data-week": wk });
      li.appendChild(el("a", { href: href("calendar", wk) }, weekLabel(wk)));
      li.appendChild(el("span", { class: "count" }, fmt(byWeek[wk].length)));
      ul.appendChild(li);
    });
    t.side.appendChild(ul);

    var bar = el("div", { class: "cal-bar" });
    var prev = el("button", { type: "button" }, "‹ 前の週");
    var next = el("button", { type: "button" }, "次の週 ›");
    var label = el("span", { class: "week" });
    var hits = el("span", { class: "count" });
    prev.addEventListener("click", function () { var i = weeks.indexOf(state.week); if (i < weeks.length - 1) location.hash = href("calendar", weeks[i + 1]); });
    next.addEventListener("click", function () { var i = weeks.indexOf(state.week); if (i > 0) location.hash = href("calendar", weeks[i - 1]); });
    bar.appendChild(prev); bar.appendChild(label); bar.appendChild(hits); bar.appendChild(next);
    bar.appendChild(el("span", { class: "count" }, "投稿が書かれた日時（日本時間）で置いています"));
    t.content.appendChild(bar);
    var wrap = el("div", { class: "cal-wrap" });
    var table = el("table");
    var calBox = el("div", { class: "cal" });
    calBox.appendChild(table);
    var panel = el("aside", { class: "panel" });
    panel.appendChild(el("div", { class: "count" }, "投稿を押すと、ここに表示します"));
    wrap.appendChild(calBox); wrap.appendChild(panel);
    t.content.appendChild(wrap);
    ui = { ul: ul, prev: prev, next: next, label: label, hits: hits, table: table, panel: panel };
  }
  function render() {
    if (!ui || !state.week) return;
    var i = weeks.indexOf(state.week);
    ui.prev.disabled = i >= weeks.length - 1;
    ui.next.disabled = i <= 0;
    ui.label.textContent = weekLabel(state.week);
    var items = byWeek[state.week].filter(matches);
    ui.hits.textContent = fmt(items.length) + " 件";
    ui.ul.querySelectorAll("li").forEach(function (li) {
      li.classList.toggle("active", li.dataset.week === state.week);
      li.classList.toggle("off", !byWeek[li.dataset.week].some(matches));
    });
    var active = ui.ul.querySelector("li.active");
    if (active && typeof active.scrollIntoView === "function") active.scrollIntoView({ block: "nearest" });
    var cells = {};
    items.forEach(function (p) { (cells[p.cal.w + "-" + p.cal.h] = cells[p.cal.w + "-" + p.cal.h] || []).push(p); });
    var table = ui.table;
    table.textContent = "";
    var head = el("tr");
    head.appendChild(el("th", { class: "hour" }));
    for (var w = 0; w < 7; w++) {
      var th = el("th", {}, D.weekdays[w]);
      th.appendChild(el("span", { class: "d" }, dayLabel(state.week, w)));
      head.appendChild(th);
    }
    table.appendChild(head);
    for (var h = 0; h < 24; h++) {
      var tr = el("tr");
      tr.appendChild(el("td", { class: "hour" }, h + ":00"));
      for (var w2 = 0; w2 < 7; w2++) {
        var td = el("td");
        (cells[w2 + "-" + h] || []).sort(function (a, b) { return a.cal.m - b.cal.m; }).forEach(function (p) {
          var ev = el("button", { type: "button", class: "ev" + (p.id === state.selected ? " on" : ""), style: "--c:" + colorOf(p.grp), title: p.cat + " ・ " + p.src });
          ev.appendChild(el("span", { class: "cat" }, p.cat));
          var body = el("span", { class: "body" });
          body.appendChild(el("b", {}, pad(p.cal.h) + ":" + pad(p.cal.m)));
          body.appendChild(document.createTextNode(p.tx));
          ev.appendChild(body);
          ev.addEventListener("click", function () { show(p, ev); });
          td.appendChild(ev);
        });
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
  }
  function show(p, ev) {
    state.selected = p.id;
    ui.table.querySelectorAll(".ev.on").forEach(function (x) { x.classList.remove("on"); });
    ev.classList.add("on");
    ui.panel.textContent = "";
    ui.panel.appendChild(card(p, "calendar"));
  }
  return {
    build: build,
    weeks: weeks.length,
    // 週を指定して開く。無い週や指定なしなら、前に見ていた週か一番新しい週
    goto: function (arg) {
      if (arg && byWeek[arg]) state.week = arg;
      else if (!state.week) state.week = weeks[0] || null;
      if (state.week) history.replaceState(null, "", href("calendar", state.week));
      render();
    },
    setQuery: function (w) { state.query = w; render(); },
  };
})();

// ---- 見方の切り替えと、URL の # との対応
var tabs = {};
var build = { categories: buildCategories, authors: buildAuthors, calendar: cal.build };
TABS.forEach(function (n) {
  var root = byId("tab-" + n);
  tabs[n] = { name: n, root: root, side: root.querySelector(".side"), content: root.querySelector(".content"), built: false, scroll: 0, lastArg: null, activeId: null, cards: [], sections: [], navOf: {}, empty: null };
});
var current = null;
byId("badge-categories").textContent = fmt(D.sections.reduce(function (n, s) { return n + s.cats.length; }, 0));
byId("badge-authors").textContent = fmt(D.authors.filter(function (a) { return a.handle !== null; }).length);
byId("badge-calendar").textContent = fmt(cal.weeks) + " 週";
function parseHash() {
  var m = /^#\\/(categories|authors|calendar)(?:\\/(.*))?$/.exec(location.hash);
  if (!m) return null;
  var arg = null;
  try { arg = m[2] ? decodeURIComponent(m[2]) : null; } catch (e) { arg = null; }
  return { tab: m[1], arg: arg };
}
function findSection(t, arg) {
  for (var i = 0; i < t.sections.length; i++) if (t.sections[i].dataset.arg === arg) return t.sections[i];
  return null;
}
function apply() {
  var r = parseHash();
  if (!r) { history.replaceState(null, "", "#/categories"); r = { tab: "categories", arg: null }; }
  var t = tabs[r.tab];
  var switched = r.tab !== current;
  if (switched) {
    if (current) tabs[current].scroll = scrollY;
    TABS.forEach(function (n) { tabs[n].root.hidden = n !== r.tab; });
    if (!t.built) { build[r.tab](t); t.built = true; }
    current = r.tab;
    document.querySelectorAll(".tabs a").forEach(function (a) { a.classList.toggle("on", a.dataset.tab === r.tab); });
    applySearch(true);
  }
  document.body.classList.remove("side-open");
  if (r.tab === "calendar") {
    cal.goto(r.arg);
    if (switched) scrollTo(0, t.scroll);
  } else if (r.arg !== null && !(switched && r.arg === t.lastArg)) {
    var s = findSection(t, r.arg);
    if (s) { s.classList.remove("hidden"); s.scrollIntoView(); }
  } else if (switched) {
    scrollTo(0, t.scroll);
  } else {
    scrollTo(0, 0);
  }
  t.lastArg = r.arg;
  t.activeId = null;
  updateActive();
}
addEventListener("hashchange", apply);

// ---- 読んでいる章を左の一覧で強調し、URL にも持つ
function updateActive() {
  var t = tabs[current];
  if (!t || current === "calendar") return;
  var cur = null;
  for (var i = 0; i < t.sections.length; i++) {
    var s = t.sections[i];
    if (s.classList.contains("hidden")) continue;
    if (s.getBoundingClientRect().top <= 120) cur = s; else break;
  }
  if (!cur) for (var j = 0; j < t.sections.length; j++) if (!t.sections[j].classList.contains("hidden")) { cur = t.sections[j]; break; }
  if (!cur || cur.id === t.activeId) return;
  t.activeId = cur.id;
  t.side.querySelectorAll("li.active").forEach(function (li) { li.classList.remove("active"); });
  var li = t.navOf[cur.id];
  if (!li) return;
  li.classList.add("active");
  for (var p = li.previousElementSibling; p; p = p.previousElementSibling) {
    if (p.classList.contains("group")) { p.classList.add("active"); break; }
  }
  if (typeof li.scrollIntoView === "function") li.scrollIntoView({ block: "nearest" });
  t.lastArg = cur.dataset.arg;
  history.replaceState(null, "", href(current, cur.dataset.arg));
}
var ticking = false;
addEventListener("scroll", function () {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(function () { ticking = false; updateActive(); });
}, { passive: true });

// ---- 検索。いま見ている見方の中を、本文・投稿者・カテゴリーで絞る
var q = byId("q"), hits = byId("hits"), timer = null;
q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { applySearch(false); }, 120); });
function applySearch(silent) {
  var w = q.value.trim().toLowerCase();
  var t = tabs[current];
  if (!t) return;
  if (current === "calendar") { cal.setQuery(w); hits.textContent = ""; return; }
  var n = 0;
  t.cards.forEach(function (c) {
    var hide = !!w && c.dataset.key.indexOf(w) < 0;
    c.classList.toggle("hidden", hide);
    if (!hide) n++;
  });
  t.sections.forEach(function (s) {
    var any = !w || !!s.querySelector(".card:not(.hidden)");
    s.classList.toggle("hidden", !any);
    var li = t.navOf[s.id];
    if (li) li.classList.toggle("hidden", !any);
  });
  var groupVisible = function (start, cls) {
    for (var x = start.nextElementSibling; x && !x.classList.contains(cls); x = x.nextElementSibling) if (!x.classList.contains("hidden")) return true;
    return false;
  };
  t.side.querySelectorAll("li.group:not([data-target])").forEach(function (g) { g.classList.toggle("hidden", !groupVisible(g, "group")); });
  t.content.querySelectorAll(".group-title").forEach(function (h) { h.classList.toggle("hidden", !groupVisible(h, "group-title")); });
  if (t.empty) t.empty.hidden = n > 0;
  hits.textContent = w ? "一致 " + fmt(n) + " 件" : "";
  if (!silent) { scrollTo(0, 0); t.activeId = null; updateActive(); }
}

// ---- キー操作: / で検索へ、1・2・3 で見方を切り替え、Esc で検索を消す
addEventListener("keydown", function (e) {
  var tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") {
    if (e.key === "Escape" && e.target === q) { q.value = ""; applySearch(false); q.blur(); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "/") { e.preventDefault(); q.focus(); }
  else if (e.key === "1" || e.key === "2" || e.key === "3") location.hash = href(TABS[Number(e.key) - 1]);
});
byId("menu").addEventListener("click", function () { document.body.classList.toggle("side-open"); });
// 上の帯は狭い画面で 2 段になるので、その高さに合わせて左の一覧や表の見出しの位置を決める
var top = document.querySelector(".top");
function fitTop() { document.documentElement.style.setProperty("--top", top.offsetHeight + "px"); }
fitTop();
addEventListener("resize", fitTop);
if (window.ResizeObserver) new ResizeObserver(fitTop).observe(top);

apply();
})();
</script>
</body>
</html>
`;
}
