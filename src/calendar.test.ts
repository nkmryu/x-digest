import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarCell, calendarEntries, renderCalendarHtml } from "./calendar.ts";
import type { Category, Post } from "./store.ts";

test("投稿の時刻を日本時間に直し、月曜始まりの曜日・時・分と、その週の月曜にする", () => {
  // 2026-10-24 は土曜。UTC 03:12 は日本時間 12:12。その週の月曜は 10-19
  assert.deepEqual(calendarCell("2026-10-24T03:12:00.000Z"), { date: "2026-10-24", week: "2026-10-19", w: 5, h: 12, m: 12 });
  // UTC 16:30 は日本時間で翌日（日曜）1:30。週は同じ
  assert.deepEqual(calendarCell("2026-10-24T16:30:00.000Z"), { date: "2026-10-25", week: "2026-10-19", w: 6, h: 1, m: 30 });
  // 日本時間の月曜 0:05 は、その日が週の始まり
  assert.deepEqual(calendarCell("2026-10-25T15:05:00.000Z"), { date: "2026-10-26", week: "2026-10-26", w: 0, h: 0, m: 5 });
  assert.equal(calendarCell("not a date"), null);
});

const post = (id: string, over: Partial<Post>): Post => ({ id, text: `本文 ${id}`, urls: [], sources: ["like"], firstSeenAt: "", ...over });
const categories: Category[] = [
  { name: "a", description: "", group: "A" },
  { name: "hidden", description: "", group: "A", excludeFromHtml: true },
  { name: "c", description: "" },
];

test("HTML から外したカテゴリーと、時刻や分類の無い投稿は、カレンダーに置かない", () => {
  const entries = calendarEntries(
    [
      post("1", { category: "a", createdAt: "2026-10-24T03:12:00.000Z" }),
      post("2", { category: "hidden", createdAt: "2026-10-24T03:12:00.000Z" }),
      post("3", { category: "a" }),
      post("4", { createdAt: "2026-10-24T03:12:00.000Z" }),
      post("5", { category: "c", createdAt: "2026-10-24T03:12:00.000Z", unlikedAt: "x" }),
    ],
    categories,
    new Set(["hidden"]),
  );
  assert.deepEqual(
    entries.map((e) => [e.id, e.group, e.source, e.week]),
    [
      ["1", "A", "いいね", "2026-10-19"],
      ["5", null, "いいね（解除済み）", "2026-10-19"],
    ],
  );
});

test("本文に </script> があっても、ページの script を抜け出さない", () => {
  const html = renderCalendarHtml(
    [{ id: "1", date: "2026-10-24", week: "2026-10-19", w: 5, h: 12, m: 0, text: "</script><img src=x onerror=alert(1)>", category: "a", group: "A", source: "いいね" }],
    [{ name: "a", group: "A" }],
    "更新",
  );
  assert.equal(html.match(/<\/script>/g)?.length, 1);
  assert.doesNotMatch(html, /<img src=x/);
});
