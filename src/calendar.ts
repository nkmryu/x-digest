import type { Category, Post } from "./store.ts";
import { escapeHtml } from "./summary-html.ts";
import { listText, sourceLabel } from "./view.ts";

export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 投稿が書かれた時刻を日本時間に直し、月曜始まりの曜日（0〜6）と時（0〜23）と日付にする */
export function calendarCell(createdAt: string): { w: number; h: number; date: string } | null {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return null;
  const jst = new Date(t + JST_OFFSET_MS);
  return { w: (jst.getUTCDay() + 6) % 7, h: jst.getUTCHours(), date: jst.toISOString().slice(0, 10) };
}

export interface CalendarEntry {
  id: string;
  w: number;
  h: number;
  date: string;
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
      w: cell.w,
      h: cell.h,
      date: cell.date,
      text: flat.length > 120 ? `${flat.slice(0, 120)}…` : flat,
      category: p.category,
      group: groupOf.get(p.category) ?? null,
      source: sourceLabel(p),
    });
  }
  return out;
}

// JSON を <script> に埋めるので、</script> や <!-- で抜け出せないよう < をエスケープする
const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

export function renderCalendarHtml(entries: CalendarEntry[], groups: string[], updated: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>X のまとめ：曜日×時間</title>
<style>
:root {
  --bg: #f7f7f5; --panel: #ffffff; --text: #1d1d1b; --muted: #6b6b66; --line: #e3e3de; --accent: #1d6fd8;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #151514; --panel: #1e1e1c; --text: #ecece8; --muted: #9a9a93; --line: #33332f; --accent: #6aa8ff; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.6 system-ui, -apple-system, "Hiragino Sans", sans-serif; }
.page { max-width: 1100px; margin: 0 auto; padding: 24px 16px 80px; }
header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px 20px; margin-bottom: 8px; }
h1 { font-size: 18px; margin: 0; }
header a { color: var(--accent); text-decoration: none; font-size: 14px; }
.note { color: var(--muted); font-size: 13px; margin: 0 0 16px; }
.filter { margin-bottom: 16px; display: flex; flex-wrap: wrap; gap: 6px; }
.filter button { font: inherit; font-size: 13px; padding: 4px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); color: var(--text); cursor: pointer; }
.filter button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.grid { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
table { border-collapse: separate; border-spacing: 3px; width: 100%; min-width: 560px; }
th { font-weight: 600; font-size: 12px; color: var(--muted); }
th.hour { text-align: right; padding-right: 6px; white-space: nowrap; width: 3.5em; }
td.cell { height: 26px; border-radius: 4px; text-align: center; font-size: 12px; cursor: pointer; background: color-mix(in srgb, var(--accent) calc(var(--heat) * 100%), var(--line) 25%); color: var(--text); }
td.cell:hover { outline: 2px solid var(--accent); }
td.cell.on { outline: 2px solid var(--text); }
td.total, th.total { color: var(--muted); font-size: 11px; text-align: center; }
#list { margin-top: 20px; }
#list h2 { font-size: 16px; margin: 0 0 8px; }
.item { padding: 8px 0; border-top: 1px solid var(--line); }
.item .meta { display: block; color: var(--muted); font-size: 12px; }
.item a { color: var(--text); text-decoration: none; }
.item a:hover { color: var(--accent); }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>曜日×時間</h1>
    <a href="digest.html">← まとめに戻る</a>
    <span class="note" style="margin:0">${escapeHtml(updated)}</span>
  </header>
  <p class="note">投稿が書かれた日時（日本時間）で数えています。いいねやブックマークをした日時ではありません。セルを押すと、その時間帯の投稿を下に並べます。</p>
  <div class="filter" id="filter"></div>
  <div class="grid"><table id="table"></table></div>
  <div id="list"></div>
</div>
<script>
// ページの変数を外に出さない。ほかのスクリプトや開発者ツールの変数と名前がぶつからないようにする
(function () {
var DATA = ${jsonForScript(entries)};
var GROUPS = ${jsonForScript(groups)};
var WEEKDAYS = ${jsonForScript(WEEKDAYS)};
var group = null;
var selected = null;
var cells = [];

function el(tag, attrs, text) {
  var e = document.createElement(tag);
  for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (text !== undefined) e.textContent = text;
  return e;
}
function filtered() { return group === null ? DATA : DATA.filter(function (d) { return d.group === group; }); }

// 親グループの切り替え
var filter = document.getElementById("filter");
[null].concat(GROUPS).forEach(function (g) {
  var b = el("button", {}, g === null ? "すべて" : g);
  if (g === group) b.className = "on";
  b.addEventListener("click", function () {
    group = g;
    filter.querySelectorAll("button").forEach(function (x) { x.className = ""; });
    b.className = "on";
    render();
  });
  filter.appendChild(b);
});

// 表は 1 回だけ作り、件数と色だけ描き直す
var table = document.getElementById("table");
var head = el("tr"); head.appendChild(el("th"));
WEEKDAYS.forEach(function (w) { head.appendChild(el("th", {}, w)); });
head.appendChild(el("th", { class: "total" }, "計"));
table.appendChild(head);
var rowTotals = [], colTotals = [];
for (var h = 0; h < 24; h++) {
  var tr = el("tr");
  tr.appendChild(el("th", { class: "hour" }, h + "時"));
  cells[h] = [];
  for (var w = 0; w < 7; w++) {
    var td = el("td", { class: "cell", "data-w": w, "data-h": h });
    td.addEventListener("click", select);
    tr.appendChild(td);
    cells[h][w] = td;
  }
  rowTotals[h] = el("td", { class: "total" });
  tr.appendChild(rowTotals[h]);
  table.appendChild(tr);
}
var foot = el("tr"); foot.appendChild(el("th", { class: "total" }, "計"));
for (var w2 = 0; w2 < 7; w2++) { colTotals[w2] = el("td", { class: "total" }); foot.appendChild(colTotals[w2]); }
var grand = el("td", { class: "total" }); foot.appendChild(grand);
table.appendChild(foot);

function render() {
  var counts = [], max = 0, rows = [], cols = [0, 0, 0, 0, 0, 0, 0], total = 0;
  for (var h = 0; h < 24; h++) { counts[h] = [0, 0, 0, 0, 0, 0, 0]; rows[h] = 0; }
  filtered().forEach(function (d) { counts[d.h][d.w]++; rows[d.h]++; cols[d.w]++; total++; });
  for (var h2 = 0; h2 < 24; h2++) for (var w = 0; w < 7; w++) if (counts[h2][w] > max) max = counts[h2][w];
  for (var h3 = 0; h3 < 24; h3++) {
    for (var w3 = 0; w3 < 7; w3++) {
      var n = counts[h3][w3], td = cells[h3][w3];
      td.textContent = n === 0 ? "" : String(n);
      td.style.setProperty("--heat", max === 0 ? 0 : n / max);
      td.title = WEEKDAYS[w3] + "曜 " + h3 + "時台: " + n + " 件";
    }
    rowTotals[h3].textContent = rows[h3] || "";
  }
  for (var w4 = 0; w4 < 7; w4++) colTotals[w4].textContent = cols[w4] || "";
  grand.textContent = total;
  if (selected) showList(selected.w, selected.h);
}

function select(e) {
  var td = e.currentTarget;
  table.querySelectorAll("td.on").forEach(function (x) { x.classList.remove("on"); });
  td.classList.add("on");
  selected = { w: Number(td.dataset.w), h: Number(td.dataset.h) };
  showList(selected.w, selected.h);
}

function showList(w, h) {
  var list = document.getElementById("list");
  list.textContent = "";
  var items = filtered().filter(function (d) { return d.w === w && d.h === h; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  list.appendChild(el("h2", {}, WEEKDAYS[w] + "曜 " + h + "時台" + (group === null ? "" : "（" + group + "）") + " " + items.length + " 件"));
  items.forEach(function (d) {
    var div = el("div", { class: "item" });
    div.appendChild(el("span", { class: "meta" }, d.date + " ・ " + d.category + " ・ " + d.source));
    div.appendChild(el("a", { href: "https://x.com/i/status/" + d.id, target: "_blank", rel: "noopener noreferrer" }, d.text));
    list.appendChild(div);
  });
}
render();
})();
</script>
</body>
</html>
`;
}
