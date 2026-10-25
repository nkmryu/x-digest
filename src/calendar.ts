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
