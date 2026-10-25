import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCategories } from "../categories.ts";
import { cliArgs } from "../cli.ts";
import { OUT_DIR, isSourceActive, loadPosts } from "../store.ts";
import { escapeHtml } from "../summary-html.ts";
import { parsePlan } from "../unlike.ts";
import { listText } from "../view.ts";

const values = cliArgs({
  // 見せる一覧（x:pick や確認モードが書いたもの）
  plan: { type: "string" },
  out: { type: "string", default: path.join(OUT_DIR, "candidates.html") },
  title: { type: "string", default: "取り消しの候補" },
});
if (!values.plan) throw new Error("--plan で一覧のファイルを指定してください");

const planText = await readFile(values.plan, "utf8");
const ids = parsePlan(planText);
// 一覧の各行の末尾「 — 理由」を拾う
const reasons = new Map<string, string>();
for (const line of planText.split("\n")) {
  const m = /^(\d+)\t.*? — (.+)$/.exec(line);
  if (m) reasons.set(m[1]!, m[2]!);
}

const store = await loadPosts();
const categories = await loadCategories();
const groupOf = new Map(categories.map((c) => [c.name, c.group ?? null]));
const entries = ids.flatMap((id) => {
  const p = store.posts[id];
  if (!p) return [];
  const flat = listText(p).replace(/\s+/g, " ").trim();
  return [
    {
      id,
      date: p.createdAt?.slice(0, 10) ?? "",
      text: flat.length > 200 ? `${flat.slice(0, 200)}…` : flat,
      category: p.category ?? "未分類",
      group: groupOf.get(p.category ?? "") ?? "その他",
      author: p.author?.handle ?? "",
      like: isSourceActive(p, "like"),
      bookmark: isSourceActive(p, "bookmark"),
      reason: reasons.get(id) ?? "",
    },
  ];
});
const groups = [...new Set(categories.flatMap((c) => (c.group ? [c.group] : [])))];
// JSON を <script> に埋めるので、</script> で抜け出せないよう < をエスケープする
const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(values.title)}</title>
<style>
:root { --bg: #f7f7f5; --panel: #ffffff; --text: #1d1d1b; --muted: #6b6b66; --line: #e3e3de; --accent: #1d6fd8; --warn: #b45309; }
@media (prefers-color-scheme: dark) { :root { --bg: #151514; --panel: #1e1e1c; --text: #ecece8; --muted: #9a9a93; --line: #33332f; --accent: #6aa8ff; --warn: #f59e0b; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.6 system-ui, -apple-system, "Hiragino Sans", sans-serif; }
.top { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); padding: 10px 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
h1 { font-size: 16px; margin: 0; }
.top a { color: var(--accent); text-decoration: none; font-size: 13px; }
.note { color: var(--muted); font-size: 12px; }
select, input[type=search], button { font: inherit; font-size: 13px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--text); }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; cursor: pointer; }
main { max-width: 1320px; margin: 0 auto; padding: 16px; }
h2 { font-size: 15px; margin: 20px 0 8px; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; align-items: start; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; }
.card.keep { opacity: 0.45; }
.card .head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; font-size: 12px; color: var(--muted); }
.card label { display: flex; align-items: center; gap: 4px; color: var(--text); cursor: pointer; white-space: nowrap; }
.card .reason { color: var(--warn); font-size: 12px; margin: 4px 0 6px; }
.card .text { font-size: 13px; overflow-wrap: anywhere; }
.card .links { font-size: 12px; margin-top: 4px; }
.card .links a { color: var(--accent); }
.tweet { margin-top: 8px; }
.tweet > .twitter-tweet { margin: 0 !important; }
.hidden { display: none; }
</style>
</head>
<body>
<div class="top">
  <h1>${escapeHtml(values.title)} <span class="note" id="count"></span></h1>
  <a href="./#/categories">← まとめに戻る</a>
  <select id="group"></select>
  <select id="source"><option value="">いいね・ブックマーク両方</option><option value="like">いいねだけ</option><option value="bookmark">ブックマークだけ</option></select>
  <input type="search" id="q" placeholder="本文・理由・投稿者で絞る">
  <label class="note"><input type="checkbox" id="embed" checked> 埋め込みを読み込む</label>
  <button class="primary" id="download">チェックを外した分を # にして一覧を書き出す</button>
</div>
<main id="main"></main>
<script>
window.twttr = (function (d, s, id) {
  var js, fjs = d.getElementsByTagName(s)[0], t = window.twttr || {};
  if (d.getElementById(id)) return t;
  js = d.createElement(s); js.id = id; js.async = true; js.src = "https://platform.twitter.com/widgets.js";
  fjs.parentNode.insertBefore(js, fjs);
  t._e = []; t.ready = function (f) { t._e.push(f); };
  return t;
})(document, "script", "twitter-wjs");
(function () {
var DATA = ${json(entries)};
var GROUPS = ${json(groups)};
var PLAN = ${json(planText)};
var theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
var keep = {};
// チェックの状態は、同じページを開き直しても残す
try { keep = JSON.parse(localStorage.getItem("keep:" + location.pathname) || "{}"); } catch (e) {}
function saveKeep() { try { localStorage.setItem("keep:" + location.pathname, JSON.stringify(keep)); } catch (e) {} }
function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; }

var groupSel = document.getElementById("group");
groupSel.appendChild(el("option", { value: "" }, "すべての親グループ"));
GROUPS.concat(["その他"]).forEach(function (g) { groupSel.appendChild(el("option", { value: g }, g)); });
var q = document.getElementById("q"), sourceSel = document.getElementById("source"), embedToggle = document.getElementById("embed");
[groupSel, sourceSel, embedToggle].forEach(function (x) { x.addEventListener("change", render); });
q.addEventListener("input", render);

var io = new IntersectionObserver(function (entries) {
  entries.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); embed(e.target); } });
}, { rootMargin: "400px" });
function embed(box) {
  if (box.dataset.started || !embedToggle.checked) return;
  box.dataset.started = "1";
  twttr.ready(function (t) { t.widgets.createTweet(box.dataset.id, box, { theme: theme, lang: "ja", dnt: true, conversation: "none" }); });
}

function render() {
  var main = document.getElementById("main");
  main.textContent = "";
  var g = groupSel.value, s = sourceSel.value, w = q.value.trim().toLowerCase();
  var items = DATA.filter(function (d) {
    if (g && d.group !== g) return false;
    if (s === "like" && !d.like) return false;
    if (s === "bookmark" && !d.bookmark) return false;
    if (w && (d.text + " " + d.reason + " " + d.author + " " + d.category).toLowerCase().indexOf(w) < 0) return false;
    return true;
  });
  document.getElementById("count").textContent = items.length + " 件（全 " + DATA.length + " 件、残す印 " + Object.keys(keep).filter(function (k) { return keep[k]; }).length + " 件）";
  var byCat = {};
  items.forEach(function (d) { (byCat[d.category] = byCat[d.category] || []).push(d); });
  Object.keys(byCat).sort(function (a, b) { return byCat[b].length - byCat[a].length; }).forEach(function (cat) {
    main.appendChild(el("h2", {}, cat + "（" + byCat[cat].length + " 件）"));
    var grid = el("div", { class: "grid" });
    byCat[cat].forEach(function (d) {
      var card = el("div", { class: "card" + (keep[d.id] ? " keep" : "") });
      var head = el("div", { class: "head" });
      head.appendChild(el("span", {}, d.date + (d.author ? " ・ @" + d.author : "") + " ・ " + [d.like ? "いいね" : null, d.bookmark ? "ブックマーク" : null].filter(Boolean).join("・")));
      var label = el("label");
      var cb = el("input", { type: "checkbox" });
      cb.checked = !keep[d.id];
      cb.addEventListener("change", function () { keep[d.id] = !cb.checked; card.className = "card" + (keep[d.id] ? " keep" : ""); saveKeep(); render(); });
      label.appendChild(cb); label.appendChild(document.createTextNode("取り消す"));
      head.appendChild(label);
      card.appendChild(head);
      if (d.reason) card.appendChild(el("div", { class: "reason" }, d.reason));
      card.appendChild(el("div", { class: "text" }, d.text));
      var links = el("div", { class: "links" });
      links.appendChild(el("a", { href: "https://x.com/i/status/" + d.id, target: "_blank", rel: "noopener noreferrer" }, "X で開く"));
      card.appendChild(links);
      var box = el("div", { class: "tweet", "data-id": d.id });
      card.appendChild(box);
      io.observe(box);
      grid.appendChild(card);
    });
    main.appendChild(grid);
  });
}

// チェックを外した投稿の行を # にして、一覧のファイルとして書き出す
document.getElementById("download").addEventListener("click", function () {
  var out = PLAN.split("\\n").map(function (line) {
    var m = /^(\\d+)(\\s|$)/.exec(line);
    return m && keep[m[1]] ? "# " + line : line;
  }).join("\\n");
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([out], { type: "text/plain" }));
  a.download = ${json(path.basename(values.plan))};
  a.click();
});
render();
})();
</script>
</body>
</html>
`;

await mkdir(path.dirname(values.out), { recursive: true });
await writeFile(values.out, html);
console.log(`${values.out} に書き出しました（${entries.length} 件。一覧にあって記録に無い ${ids.length - entries.length} 件は除く）`);
