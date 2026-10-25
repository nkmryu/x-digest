import type { Post } from "./store.ts";
import { escapeHtml } from "./summary-html.ts";
import { listText, sourceLabel } from "./view.ts";
import { postUrl } from "./x/api.ts";

export interface AuthorSection {
  // 投稿者不明は null
  handle: string | null;
  name: string;
  posts: Post[];
}

const byDateDesc = (a: Post, b: Post) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");

/**
 * 投稿を投稿者ごとにまとめ、投稿の多い順に並べる。同数なら新しい投稿がある人が先。
 * 表示名は一番新しい投稿のもの（X で名前を変える人がいるため）
 */
export function groupByAuthor(posts: Post[]): AuthorSection[] {
  const map = new Map<string | null, Post[]>();
  for (const p of posts) {
    const key = p.author?.handle ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return [...map.entries()]
    .map(([handle, ps]) => {
      ps.sort(byDateDesc);
      return { handle, name: handle === null ? "投稿者不明" : (ps[0]!.author?.name ?? handle), posts: ps };
    })
    .sort((a, b) => b.posts.length - a.posts.length || (b.posts[0]!.createdAt ?? "").localeCompare(a.posts[0]!.createdAt ?? ""));
}

export function renderAuthorsHtml(posts: Post[], updated: string): string {
  const sections = groupByAuthor(posts);
  const many = sections.filter((s) => s.handle !== null && s.posts.length >= 2);
  const single = sections.filter((s) => s.handle !== null && s.posts.length === 1);
  const unknown = sections.find((s) => s.handle === null);

  const snippet = (p: Post) => {
    const flat = listText(p).replace(/\s+/g, " ").trim();
    return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
  };
  const tweet = (p: Post, withAuthor: boolean) => `
<div class="tweet" data-id="${p.id}">
  <div class="fallback">
    <div class="meta">${escapeHtml(p.createdAt?.slice(0, 10) ?? "")} ・ ${sourceLabel(p)}${withAuthor && p.author ? ` ・ @${escapeHtml(p.author.handle)}` : ""}</div>
    <div>${escapeHtml(snippet(p))}</div>
    <a href="${postUrl(p.id)}" target="_blank" rel="noopener noreferrer">X で開く</a>
  </div>
</div>`;
  const profile = (handle: string) => `https://x.com/${encodeURIComponent(handle)}`;

  const navItems: string[] = [];
  const main: string[] = [];
  many.forEach((s, i) => {
    navItems.push(
      `<li data-key="${escapeHtml(`${s.name} ${s.handle}`.toLowerCase())}"><a href="#a-${i}">${escapeHtml(s.name)}</a> <span class="count">${s.posts.length}</span></li>`,
    );
    main.push(`
<section id="a-${i}" data-key="${escapeHtml(`${s.name} ${s.handle}`.toLowerCase())}">
  <h2 class="cat">${escapeHtml(s.name)} <a class="handle" href="${profile(s.handle!)}" target="_blank" rel="noopener noreferrer">@${escapeHtml(s.handle!)}</a> <span class="count">${s.posts.length} 件</span></h2>
  <div class="tweets">${s.posts.map((p) => tweet(p, false)).join("")}</div>
</section>`);
  });
  const singles = single.flatMap((s) => s.posts).sort(byDateDesc);
  if (singles.length > 0) {
    navItems.push(`<li class="group" data-key="1 件だけの投稿者"><a href="#a-single">1 件だけの投稿者</a> <span class="count">${singles.length}</span></li>`);
    main.push(`
<section id="a-single" data-key="1 件だけの投稿者">
  <h2 class="cat">1 件だけの投稿者 <span class="count">${single.length} 人 ・ ${singles.length} 件</span></h2>
  <div class="tweets">${singles.map((p) => tweet(p, true)).join("")}</div>
</section>`);
  }
  if (unknown) {
    navItems.push(`<li class="group" data-key="投稿者不明"><a href="#a-unknown">投稿者不明</a> <span class="count">${unknown.posts.length}</span></li>`);
    main.push(`
<section id="a-unknown" data-key="投稿者不明">
  <h2 class="cat">投稿者不明 <span class="count">${unknown.posts.length} 件</span></h2>
  <p class="note">消された投稿か非公開の投稿で、投稿者を取れなかったものです。</p>
  <div class="tweets">${unknown.posts.map((p) => tweet(p, false)).join("")}</div>
</section>`);
  }

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>X のまとめ：投稿者</title>
<style>
:root { --bg: #f7f7f5; --panel: #ffffff; --text: #1d1d1b; --muted: #6b6b66; --line: #e3e3de; --accent: #1d6fd8; }
@media (prefers-color-scheme: dark) { :root { --bg: #151514; --panel: #1e1e1c; --text: #ecece8; --muted: #9a9a93; --line: #33332f; --accent: #6aa8ff; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.75 system-ui, -apple-system, "Hiragino Sans", sans-serif; }
.layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); max-width: 1320px; margin: 0 auto; }
nav { position: sticky; top: 0; height: 100vh; overflow-y: auto; padding: 24px 16px; border-right: 1px solid var(--line); }
nav h1 { font-size: 16px; margin: 0 0 4px; }
nav .updated { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
nav .links { margin: 0 0 12px; font-size: 13px; }
nav .links a { color: var(--accent); }
nav input { width: 100%; font: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--text); margin-bottom: 12px; }
nav ul { list-style: none; margin: 0; padding: 0; }
nav li { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0 3px 6px; font-size: 13px; border-left: 2px solid transparent; margin-left: -8px; }
nav li.group { font-weight: 600; margin-top: 12px; }
nav li.active { border-left-color: var(--accent); }
nav li.active > a { color: var(--accent); }
nav li.hidden, section.hidden { display: none; }
nav a { color: var(--text); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
nav a:hover { color: var(--accent); }
.count { color: var(--muted); font-size: 12px; font-weight: normal; }
main { padding: 24px 32px 80px; min-width: 0; }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 24px 28px; margin-bottom: 24px; scroll-margin-top: 16px; }
.cat { margin: 0 0 12px; font-size: 20px; }
.cat .handle { font-size: 14px; font-weight: normal; color: var(--accent); text-decoration: none; margin-right: 6px; }
.note { color: var(--muted); font-size: 13px; margin: -4px 0 12px; }
.tweets { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; align-items: start; }
.tweet { min-height: 80px; border-radius: 12px; }
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
    <h1>投稿者ごと</h1>
    <div class="updated">${escapeHtml(updated)} ／ ${posts.length} 件 ・ ${sections.filter((s) => s.handle !== null).length} 人</div>
    <p class="links"><a href="digest.html">← カテゴリーのまとめ</a> ・ <a href="calendar.html">カレンダー</a></p>
    <input type="search" id="q" placeholder="投稿者の名前・ID で絞る">
    <ul id="nav">${navItems.join("")}</ul>
  </nav>
  <main id="main">${main.join("")}</main>
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
(function () {
var theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
function embed(el) {
  if (el.dataset.started) return;
  el.dataset.started = "1";
  twttr.ready(function (t) {
    t.widgets.createTweet(el.dataset.id, el, { theme: theme, lang: "ja", dnt: true, conversation: "none" }).then(function (w) { if (w) el.classList.add("loaded"); });
  });
}
// 画面に近づいた投稿から埋め込む
var io = new IntersectionObserver(function (entries) {
  entries.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); embed(e.target); } });
}, { rootMargin: "600px" });
document.querySelectorAll(".tweet").forEach(function (el) { io.observe(el); });

// 名前・ID で絞る。一覧と本文の両方を隠す
var q = document.getElementById("q");
q.addEventListener("input", function () {
  var w = q.value.trim().toLowerCase();
  document.querySelectorAll("nav li, main section").forEach(function (el) {
    el.classList.toggle("hidden", !!w && (el.dataset.key || "").indexOf(w) < 0);
  });
});

// 読んでいる投稿者を左の一覧で強調し、一覧もそこまで送る
var sections = Array.from(document.querySelectorAll("main section"));
var navItems = Array.from(document.querySelectorAll("nav li"));
var activeId = null;
function updateActive() {
  var current = null;
  for (var i = 0; i < sections.length; i++) {
    if (sections[i].classList.contains("hidden")) continue;
    if (sections[i].getBoundingClientRect().top <= 120) current = sections[i]; else break;
  }
  if (!current) current = sections.find(function (s) { return !s.classList.contains("hidden"); });
  if (!current || current.id === activeId) return;
  activeId = current.id;
  navItems.forEach(function (li) { li.classList.remove("active"); });
  var link = document.querySelector('nav a[href="#' + current.id + '"]');
  if (!link) return;
  link.parentElement.classList.add("active");
  if (typeof link.parentElement.scrollIntoView === "function") link.parentElement.scrollIntoView({ block: "nearest" });
}
var ticking = false;
addEventListener("scroll", function () {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(function () { ticking = false; updateActive(); });
}, { passive: true });
addEventListener("hashchange", updateActive);
updateActive();
})();
</script>
</body>
</html>
`;
}
