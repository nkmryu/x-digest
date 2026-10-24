import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { calendarEntries, renderCalendarHtml } from "../calendar.ts";
import { loadCategories, loadHtmlExcluded } from "../categories.ts";
import { dropForeignLinks } from "../links.ts";
import { type Post, type SummaryStore, OUT_DIR, loadPosts, paths, readJson } from "../store.ts";
import { citedIds, escapeHtml, summaryToHtml } from "../summary-html.ts";
import { type Group, groupPosts, groupSections, listText, partitionCited, sectionCount, sourceLabel } from "../view.ts";
import { postUrl } from "../x/api.ts";

const categories = await loadCategories();
const posts = Object.values((await loadPosts()).posts);
const summaries = await readJson<SummaryStore>(paths.summaries, {});
const excluded = await loadHtmlExcluded();
const groups = groupPosts(categories, posts).filter((g) => !excluded.has(g.name));
const shown = groups.reduce((n, g) => n + g.posts.length, 0);

const snippet = (p: Post) => {
  const flat = listText(p).replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
};

// 埋め込みが読み込まれるまで（消された投稿は読み込めないので、その後も）出しておく中身
const tweet = (p: Post, anchorId?: string) => `
<div class="tweet"${anchorId ? ` id="${anchorId}"` : ""} data-id="${p.id}">
  <div class="fallback">
    <div class="meta">${escapeHtml(p.createdAt?.slice(0, 10) ?? "")} ・ ${sourceLabel(p)}</div>
    <div>${escapeHtml(snippet(p))}</div>
    <a href="${postUrl(p.id)}" target="_blank" rel="noopener noreferrer">X で開く</a>
  </div>
</div>`;

// 親グループの中のカテゴリーは h3、親の無いカテゴリーは h2。章の番号（cat-N）は左の一覧と同じ通し番号
let index = 0;
const navItems: string[] = [];
const main: string[] = [];
function chapter(g: Group, level: "h2" | "h3") {
  const i = index++;
  const ids = new Set(g.posts.map((p) => p.id));
  const summary = summaries[g.name] ? dropForeignLinks(summaries[g.name]!.text, ids).text : "";
  const { cited, rest } = partitionCited(g.posts, citedIds(summary));
  navItems.push(
    `<li class="${level === "h3" ? "child" : "top"}"><a href="#cat-${i}">${escapeHtml(g.name)}</a> <span class="count">${g.posts.length}</span></li>`,
  );
  main.push(`
<section id="cat-${i}">
  <${level} class="cat">${escapeHtml(g.name)} <span class="count">${g.posts.length} 件</span></${level}>
  <div class="summary">${summaryToHtml(summary)}</div>
  ${cited.length > 0 ? `<h4 class="sub">要約の根拠の投稿 <span class="count">${cited.length} 件</span></h4><div class="tweets">${cited.map((p) => tweet(p, `c-${p.id}`)).join("")}</div>` : ""}
  ${rest.length > 0 ? `<h4 class="sub">${cited.length > 0 ? "そのほかの投稿" : "投稿"} <span class="count">${rest.length} 件</span></h4><div class="tweets">${rest.map((p) => tweet(p)).join("")}</div>` : ""}
</section>`);
}
for (const s of groupSections(categories, groups)) {
  if (s.name === null) {
    for (const g of s.groups) chapter(g, "h2");
    continue;
  }
  navItems.push(`<li class="group">${escapeHtml(s.name)} <span class="count">${sectionCount(s)}</span></li>`);
  main.push(`<h2 class="group-title">${escapeHtml(s.name)} <span class="count">${sectionCount(s)} 件</span></h2>`);
  for (const g of s.groups) chapter(g, "h3");
}
const sections = main;
const nav = navItems.join("");

const updated = escapeHtml(new Date().toLocaleString("ja-JP"));
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>X のまとめ</title>
<style>
:root {
  --bg: #f7f7f5; --panel: #ffffff; --text: #1d1d1b; --muted: #6b6b66; --line: #e3e3de; --accent: #1d6fd8; --target: #fff3c4;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #151514; --panel: #1e1e1c; --text: #ecece8; --muted: #9a9a93; --line: #33332f; --accent: #6aa8ff; --target: #4a4220; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.75 system-ui, -apple-system, "Hiragino Sans", sans-serif; }
.layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); max-width: 1320px; margin: 0 auto; }
nav { position: sticky; top: 0; height: 100vh; overflow-y: auto; padding: 24px 16px; border-right: 1px solid var(--line); }
nav h1 { font-size: 16px; margin: 0 0 4px; }
nav .updated { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
nav .links { margin: 0 0 16px; font-size: 13px; }
nav .links a { color: var(--accent); }
nav ul { list-style: none; margin: 0; padding: 0; }
nav li { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; font-size: 14px; }
nav li.group { font-weight: 600; margin-top: 12px; break-after: avoid; }
nav li.child { padding-left: 12px; }
/* 読んでいる章とその親を、左の縦線と色で示す */
nav li { border-left: 2px solid transparent; margin-left: -8px; padding-left: 6px; }
nav li.child { padding-left: 18px; }
nav li.active { border-left-color: var(--accent); }
nav li.active > a, nav li.group.active { color: var(--accent); }
nav a { color: var(--text); text-decoration: none; }
nav a:hover { color: var(--accent); }
.count { color: var(--muted); font-size: 12px; font-weight: normal; }
main { padding: 24px 32px 80px; min-width: 0; }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 24px 28px; margin-bottom: 24px; scroll-margin-top: 16px; }
.group-title { margin: 8px 0 16px; font-size: 22px; }
.cat { margin: 0 0 12px; font-size: 20px; }
.sub { margin: 24px 0 8px; font-size: 14px; font-weight: 600; color: var(--muted); }
.summary ul { padding-left: 1.4em; }
.summary li { margin: 4px 0; }
a.cite { display: inline-block; min-width: 1.6em; padding: 0 4px; border-radius: 4px; background: var(--line); color: var(--accent); text-align: center; text-decoration: none; font-size: 12px; line-height: 1.6; }
.tweets { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; align-items: start; }
.tweet { min-height: 80px; border-radius: 12px; scroll-margin-top: 16px; }
.tweet:target { outline: 3px solid var(--accent); background: var(--target); }
.tweet .fallback { padding: 12px 14px; border: 1px dashed var(--line); border-radius: 12px; font-size: 13px; overflow-wrap: anywhere; }
.tweet.loaded .fallback { display: none; }
.tweet .meta { color: var(--muted); font-size: 12px; }
.tweet .fallback a { color: var(--accent); font-size: 12px; }
.tweet > .twitter-tweet { margin: 0 !important; }
@media (max-width: 860px) {
  .layout { grid-template-columns: 1fr; }
  nav { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); padding: 16px; }
  nav ul { columns: 2; }
  main { padding: 16px; }
  section { padding: 16px; }
  .tweets { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<div class="layout">
  <nav>
    <h1>X のまとめ</h1>
    <div class="updated">${updated} ／ ${shown} 件</div>
    <p class="links"><a href="calendar.html">週ごとのカレンダーで見る</a></p>
    <ul>${nav}</ul>
  </nav>
  <main>${sections.join("")}</main>
</div>
<script>
window.twttr = (function (d, s, id) {
  var js, fjs = d.getElementsByTagName(s)[0], t = window.twttr || {};
  if (d.getElementById(id)) return t;
  js = d.createElement(s); js.id = id; js.async = true; js.src = "https://platform.twitter.com/widgets.js";
  fjs.parentNode.insertBefore(js, fjs);
  t._e = []; t.ready = function (f) { t._e.push(f); };
  return t;
})(document, "script", "twitter-wjs");

var theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
function embed(el) {
  if (el.dataset.started) return;
  el.dataset.started = "1";
  twttr.ready(function (t) {
    t.widgets.createTweet(el.dataset.id, el, { theme: theme, lang: "ja", dnt: true, conversation: "none" }).then(function (w) {
      if (w) el.classList.add("loaded");
    });
  });
}
// 画面に近づいた投稿から埋め込む
var io = new IntersectionObserver(function (entries) {
  entries.forEach(function (e) {
    if (e.isIntersecting) { io.unobserve(e.target); embed(e.target); }
  });
}, { rootMargin: "600px" });
document.querySelectorAll(".tweet").forEach(function (el) { io.observe(el); });
// 読んでいる章（画面の上端に一番近い章）を左の一覧で強調し、一覧もそこまで送る
var sections = Array.from(document.querySelectorAll("main section"));
var navItems = Array.from(document.querySelectorAll("nav li"));
var activeId = null;
function updateActive() {
  var current = null;
  for (var i = 0; i < sections.length; i++) {
    if (sections[i].getBoundingClientRect().top <= 120) current = sections[i]; else break;
  }
  if (!current && sections.length > 0) current = sections[0];
  if (!current || current.id === activeId) return;
  activeId = current.id;
  var link = document.querySelector('nav a[href="#' + current.id + '"]');
  navItems.forEach(function (li) { li.classList.remove("active"); });
  if (!link) return;
  var item = link.parentElement;
  item.classList.add("active");
  // 親グループは、その項目より前にある一番近い group
  for (var p = item.previousElementSibling; p; p = p.previousElementSibling) {
    if (p.classList.contains("group")) { p.classList.add("active"); break; }
  }
  if (typeof item.scrollIntoView === "function") item.scrollIntoView({ block: "nearest" });
}
var ticking = false;
addEventListener("scroll", function () {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(function () { ticking = false; updateActive(); });
}, { passive: true });
addEventListener("hashchange", updateActive);
updateActive();
// 根拠の番号を押したとき、まだ埋め込んでいなければその場で埋め込む
document.addEventListener("click", function (e) {
  var a = e.target.closest && e.target.closest("a.cite");
  if (a) { var el = document.getElementById("c-" + a.dataset.id); if (el) embed(el); }
});
</script>
</body>
</html>
`;

const file = path.join(OUT_DIR, "digest.html");
await mkdir(OUT_DIR, { recursive: true });
await writeFile(file, html);
console.log(`${file} に書き出しました${excluded.size > 0 ? `（外したカテゴリー: ${excluded.size} 個）` : ""}`);

const entries = calendarEntries(posts, categories, excluded);
const calendarCategories = categories.filter((c) => !excluded.has(c.name)).map((c) => ({ name: c.name, group: c.group ?? null }));
const calendarFile = path.join(OUT_DIR, "calendar.html");
await writeFile(calendarFile, renderCalendarHtml(entries, calendarCategories, `${updated} ／ ${entries.length} 件`));
console.log(`${calendarFile} に書き出しました`);
