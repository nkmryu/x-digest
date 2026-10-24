const LINK = /\s*\[\d+\]\(https:\/\/x\.com\/i\/status\/(\d+)\)/g;

/**
 * 要約の [n](https://x.com/i/status/<id>) のうち、ids に無い投稿へのリンクを外し、外した行だけ番号を 1 から振り直す。
 * Claude が、渡していない投稿の ID を作って書くことがあるため。
 * 外していない行は番号を変えない。要約によっては、行をまたいで通し番号を振っている。
 */
export function dropForeignLinks(text: string, ids: Set<string>): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const lines = text.split("\n").map((line) => {
    const foreign = [...line.matchAll(LINK)].filter((m) => !ids.has(m[1]!));
    if (foreign.length === 0) return line;
    dropped.push(...foreign.map((m) => m[1]!));
    let n = 0;
    return line.replace(LINK, (match, id: string) => {
      if (!ids.has(id)) return "";
      n++;
      return match.replace(/\[\d+\]/, `[${n}]`);
    });
  });
  return { text: lines.join("\n"), dropped };
}
