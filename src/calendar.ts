import type { Category, Post } from "./store.ts";
import { escapeHtml } from "./summary-html.ts";
import { listText, sourceLabel } from "./view.ts";

export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 投稿が書かれた時刻を日本時間に直し、日付・月曜始まりの曜日（0〜6）・時・分と、その週の月曜の日付にする */
export function calendarCell(createdAt: string): { date: string; week: string; w: number; h: number; m: number } | null {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return null;
  const jst = new Date(t + JST_OFFSET_MS);
  const w = (jst.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - w * DAY_MS);
  return { date: jst.toISOString().slice(0, 10), week: monday.toISOString().slice(0, 10), w, h: jst.getUTCHours(), m: jst.getUTCMinutes() };
}

export interface CalendarEntry {
  id: string;
  date: string;
  week: string;
  w: number;
  h: number;
  m: number;
  text: string;
  category: string;
  group: string | null;
  source: string;
}

/** まとめに出す投稿（HTML から外したカテゴリーを除く）を、カレンダーに置く形にする */
export function calendarEntries(posts: Post[], categories: Category[], excluded: Set<string>): CalendarEntry[] {
  const groupOf = new Map(categories.map((c) => [c.name, c.group ?? null]));
  const out: CalendarEntry[] = [];
  for (const p of posts) {
    if (!p.category || !p.createdAt || excluded.has(p.category)) continue;
    const cell = calendarCell(p.createdAt);
    if (!cell) continue;
    const flat = listText(p).replace(/\s+/g, " ").trim();
    out.push({
      id: p.id,
      ...cell,
      text: flat.length > 90 ? `${flat.slice(0, 90)}…` : flat,
      category: p.category,
      group: groupOf.get(p.category) ?? null,
      source: sourceLabel(p),
    });
  }
  return out;
}

// JSON を <script> に埋めるので、</script> や <!-- で抜け出せないよう < をエスケープする
const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

export interface CalendarCategory {
  name: string;
  group: string | null;
}

export function renderCalendarHtml(entries: CalendarEntry[], categories: CalendarCategory[], updated: string): string {
  // 親グループの並びは、カテゴリーの一覧で最初に出てきた順
  const groups = [...new Set(categories.flatMap((c) => (c.group ? [c.group] : [])))];
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>X のまとめ：週</title>
<style>
:root {
  --bg: #f7f7f5; --panel: #ffffff; --text: #1d1d1b; --muted: #6b6b66; --line: #e3e3de; --accent: #1d6fd8;
  --g0: #3b82f6; --g1: #10b981; --g2: #f59e0b; --g3: #a855f7; --g4: #ef4444; --g5: #6b7280;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #151514; --panel: #1e1e1c; --text: #ecece8; --muted: #9a9a93; --line: #33332f; --accent: #6aa8ff; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, -apple-system, "Hiragino Sans", sans-serif; }
.top { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); padding: 10px 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
h1 { font-size: 16px; margin: 0; }
.top a { color: var(--accent); text-decoration: none; font-size: 13px; }
.note { color: var(--muted); font-size: 12px; }
.nav { display: flex; align-items: center; gap: 6px; }
button, select { font: inherit; font-size: 13px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--text); cursor: pointer; }
button:disabled { opacity: 0.4; cursor: default; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--muted); }
.legend span { display: flex; align-items: center; gap: 5px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; background: var(--c); }
#cat { max-width: 320px; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; padding: 16px; max-width: 1500px; margin: 0 auto; }
.cal { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
table { border-collapse: collapse; width: 100%; min-width: 820px; table-layout: fixed; }
th { position: sticky; top: 0; background: var(--panel); font-size: 12px; font-weight: 600; padding: 8px 4px; border-bottom: 1px solid var(--line); }
th .d { display: block; color: var(--muted); font-weight: normal; }
th.hour, td.hour { width: 44px; text-align: right; padding-right: 6px; color: var(--muted); font-size: 11px; vertical-align: top; }
td { border-top: 1px solid var(--line); border-left: 1px solid var(--line); vertical-align: top; padding: 2px; min-height: 28px; height: 28px; }
td.today { background: color-mix(in srgb, var(--accent) 6%, transparent); }
.ev { display: block; width: 100%; text-align: left; margin: 0 0 2px; padding: 3px 6px; border: 0; border-left: 3px solid var(--c); border-radius: 4px; background: color-mix(in srgb, var(--c) 16%, var(--panel)); color: var(--text); font-size: 11px; line-height: 1.35; cursor: pointer; }
.ev .cat { display: block; font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev .body { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.ev b { font-weight: 600; margin-right: 4px; }
.ev.on { outline: 2px solid var(--text); }
.panel { position: sticky; top: 64px; align-self: start; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; min-height: 200px; }
.panel .meta { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
.panel .meta a { color: var(--accent); }
.panel .fallback { font-size: 13px; overflow-wrap: anywhere; }
.panel .empty { color: var(--muted); font-size: 13px; }
.panel > .twitter-tweet { margin: 0 !important; }
@media (max-width: 1000px) {
  .layout { grid-template-columns: 1fr; }
  .panel { position: static; }
}
</style>
</head>
<body>
<div class="top">
  <h1>週ごとの投稿</h1>
  <a href="digest.html">← まとめに戻る</a>
  <div class="nav">
    <button id="prev">‹ 前の週</button>
    <select id="weeks"></select>
    <button id="next">次の週 ›</button>
  </div>
  <select id="cat" title="絞り込み"></select>
  <div class="legend" id="legend"></div>
  <span class="note">${escapeHtml(updated)}。投稿が書かれた日時（日本時間）で置いています</span>
</div>
<div class="layout">
  <div class="cal"><table id="table"></table></div>
  <aside class="panel" id="panel"><div class="empty">投稿を押すと、ここに表示します</div></aside>
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

// ページの変数を外に出さない
(function () {
var DATA = ${jsonForScript(entries)};
var GROUPS = ${jsonForScript(groups)};
var CATEGORIES = ${jsonForScript(categories)};
var WEEKDAYS = ${jsonForScript(WEEKDAYS)};
var theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
// 絞り込み。"" はすべて、"g:親" は親グループ、"c:カテゴリー" はカテゴリー
var filter = "";
var selectedId = null;

function el(tag, attrs, text) {
  var e = document.createElement(tag);
  for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (text !== undefined) e.textContent = text;
  return e;
}
var pad = function (n) { return (n < 10 ? "0" : "") + n; };
var groupIndex = function (g) { var i = GROUPS.indexOf(g); return i < 0 ? 5 : i; };
var colorOf = function (g) { return "var(--g" + groupIndex(g) + ")"; };

// 投稿のある週だけを、新しい順に並べる
var byWeek = {};
DATA.forEach(function (d) { (byWeek[d.week] = byWeek[d.week] || []).push(d); });
var weeks = Object.keys(byWeek).sort().reverse();
var weekIndex = 0;

function weekLabel(monday) {
  var p = monday.split("-"), end = new Date(Date.UTC(+p[0], p[1] - 1, +p[2] + 6));
  return p[0] + "/" + p[1] + "/" + p[2] + " 〜 " + pad(end.getUTCMonth() + 1) + "/" + pad(end.getUTCDate());
}
function dayLabel(monday, w) {
  var p = monday.split("-"), d = new Date(Date.UTC(+p[0], p[1] - 1, +p[2] + w));
  return (d.getUTCMonth() + 1) + "/" + d.getUTCDate();
}

var select = document.getElementById("weeks");
weeks.forEach(function (wk, i) { select.appendChild(el("option", { value: i }, weekLabel(wk) + "（" + byWeek[wk].length + " 件）")); });
select.addEventListener("change", function () { weekIndex = Number(select.value); render(); });
document.getElementById("prev").addEventListener("click", function () { if (weekIndex < weeks.length - 1) { weekIndex++; render(); } });
document.getElementById("next").addEventListener("click", function () { if (weekIndex > 0) { weekIndex--; render(); } });

// 絞り込みの選択リスト。親グループごとに区切り、親そのものとカテゴリーを並べる
var catSelect = document.getElementById("cat");
catSelect.appendChild(el("option", { value: "" }, "すべてのカテゴリー"));
GROUPS.forEach(function (g) {
  var og = el("optgroup", { label: g });
  og.appendChild(el("option", { value: "g:" + g }, g + "（すべて）"));
  CATEGORIES.forEach(function (c) { if (c.group === g) og.appendChild(el("option", { value: "c:" + c.name }, c.name)); });
  catSelect.appendChild(og);
});
CATEGORIES.forEach(function (c) { if (c.group === null) catSelect.appendChild(el("option", { value: "c:" + c.name }, c.name)); });
catSelect.addEventListener("change", function () { filter = catSelect.value; render(); });
function matches(d) {
  if (filter === "") return true;
  return filter.slice(0, 2) === "g:" ? d.group === filter.slice(2) : d.category === filter.slice(2);
}
// 凡例は色の説明
var legend = document.getElementById("legend");
GROUPS.forEach(function (g) {
  var sp = el("span", { style: "--c:" + colorOf(g) });
  sp.appendChild(el("i"));
  sp.appendChild(document.createTextNode(g));
  legend.appendChild(sp);
});

var table = document.getElementById("table");
function render() {
  var monday = weeks[weekIndex];
  select.value = weekIndex;
  document.getElementById("prev").disabled = weekIndex >= weeks.length - 1;
  document.getElementById("next").disabled = weekIndex <= 0;
  var items = byWeek[monday].filter(matches);
  var cells = {};
  items.forEach(function (d) { (cells[d.w + "-" + d.h] = cells[d.w + "-" + d.h] || []).push(d); });
  table.textContent = "";
  var head = el("tr");
  head.appendChild(el("th", { class: "hour" }));
  for (var w = 0; w < 7; w++) {
    var th = el("th", {}, WEEKDAYS[w]);
    th.appendChild(el("span", { class: "d" }, dayLabel(monday, w)));
    head.appendChild(th);
  }
  table.appendChild(head);
  for (var h = 0; h < 24; h++) {
    var tr = el("tr");
    tr.appendChild(el("td", { class: "hour" }, h + ":00"));
    for (var w2 = 0; w2 < 7; w2++) {
      var td = el("td");
      (cells[w2 + "-" + h] || []).sort(function (a, b) { return a.m - b.m; }).forEach(function (d) {
        var ev = el("button", { class: "ev" + (d.id === selectedId ? " on" : ""), style: "--c:" + colorOf(d.group), title: d.category + " ・ " + d.source, "data-id": d.id });
        ev.appendChild(el("span", { class: "cat" }, d.category));
        var body = el("span", { class: "body" });
        body.appendChild(el("b", {}, pad(d.h) + ":" + pad(d.m)));
        body.appendChild(document.createTextNode(d.text));
        ev.appendChild(body);
        ev.addEventListener("click", function () { show(d, ev); });
        td.appendChild(ev);
      });
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
}

var panel = document.getElementById("panel");
function show(d, ev) {
  selectedId = d.id;
  table.querySelectorAll(".ev.on").forEach(function (x) { x.classList.remove("on"); });
  ev.classList.add("on");
  panel.textContent = "";
  var meta = el("div", { class: "meta" }, d.date + " " + pad(d.h) + ":" + pad(d.m) + " ・ " + d.category + " ・ " + d.source + " ・ ");
  meta.appendChild(el("a", { href: "https://x.com/i/status/" + d.id, target: "_blank", rel: "noopener noreferrer" }, "X で開く"));
  panel.appendChild(meta);
  var fallback = el("div", { class: "fallback" }, d.text);
  panel.appendChild(fallback);
  // 埋め込みが読めたら本文の先頭は消す。消された投稿は読めないので残る
  twttr.ready(function (t) {
    if (selectedId !== d.id) return;
    t.widgets.createTweet(d.id, panel, { theme: theme, lang: "ja", dnt: true, conversation: "none" }).then(function (w) {
      if (w && selectedId === d.id) fallback.remove();
    });
  });
}
render();
})();
</script>
</body>
</html>
`;
}
