import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarCell } from "./calendar.ts";

test("投稿の時刻を日本時間に直し、月曜始まりの曜日・時・分と、その週の月曜にする", () => {
  // 2026-10-24 は土曜。UTC 03:12 は日本時間 12:12。その週の月曜は 10-19
  assert.deepEqual(calendarCell("2026-10-24T03:12:00.000Z"), { date: "2026-10-24", week: "2026-10-19", w: 5, h: 12, m: 12 });
  // UTC 16:30 は日本時間で翌日（日曜）1:30。週は同じ
  assert.deepEqual(calendarCell("2026-10-24T16:30:00.000Z"), { date: "2026-10-25", week: "2026-10-19", w: 6, h: 1, m: 30 });
  // 日本時間の月曜 0:05 は、その日が週の始まり
  assert.deepEqual(calendarCell("2026-10-25T15:05:00.000Z"), { date: "2026-10-26", week: "2026-10-26", w: 0, h: 0, m: 5 });
  assert.equal(calendarCell("not a date"), null);
});
