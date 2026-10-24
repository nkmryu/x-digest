// 要約は他人の投稿をもとに Claude が書いた文なので、HTML はすべて文字として出す。
// 一般の Markdown ライブラリを使わないのは、生の HTML を通す既定の挙動を外す設定を持ち込むより、
// 要約で使う形（段落・入れ子の箇条書き・太字・リンク）だけを扱う方が、通るものを確かめやすいため
export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STATUS = /^https:\/\/x\.com\/i\/status\/(\d+)$/;

function inline(raw: string): string {
  let out = "";
  let last = 0;
  // リンクは本文を壊さないよう、エスケープの前に取り出す
  for (const m of raw.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
    out += bold(escapeHtml(raw.slice(last, m.index)));
    const [, label, url] = m as unknown as [string, string, string];
    const id = STATUS.exec(url)?.[1];
    out += id
      ? `<a class="cite" href="#c-${id}" data-id="${id}">${escapeHtml(label)}</a>`
      : `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    last = m.index! + m[0].length;
  }
  return out + bold(escapeHtml(raw.slice(last)));
}

const bold = (escaped: string) => escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

/** 要約の Markdown を HTML にする。根拠の投稿へのリンクは、ページ内の埋め込みへのリンクにする */
export function summaryToHtml(markdown: string): string {
  const out: string[] = [];
  let depth = 0;
  const closeTo = (d: number) => {
    while (depth > d) {
      out.push("</li></ul>");
      depth--;
    }
  };
  for (const line of markdown.split("\n")) {
    const item = /^(\s*)[-*] (.*)$/.exec(line);
    if (item) {
      const d = Math.floor(item[1]!.length / 2) + 1;
      if (d > depth) {
        while (depth < d) {
          out.push("<ul><li>");
          depth++;
        }
      } else {
        closeTo(d);
        out.push("</li><li>");
      }
      out.push(inline(item[2]!));
    } else if (line.trim() === "") {
      closeTo(0);
    } else {
      closeTo(0);
      out.push(`<p>${inline(line.trim())}</p>`);
    }
  }
  closeTo(0);
  return out.join("");
}

/** 要約の根拠に挙げた投稿の ID を、出てきた順に重ならないよう返す */
export function citedIds(markdown: string): string[] {
  const ids = [...markdown.matchAll(/\]\(https:\/\/x\.com\/i\/status\/(\d+)\)/g)].map((m) => m[1]!);
  return [...new Set(ids)];
}
