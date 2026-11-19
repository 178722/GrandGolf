// 日付ユーティリティ。日付のみの値は 'YYYY-MM-DD' 文字列で保持し、タイムゾーンの影響を受けないようUTCで計算する。

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' が実在する日付かどうか */
export function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  return isExistingDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function isExistingDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' → 'YYYY/MM/DD'（表示用） */
export function formatSlashDate(iso: string): string {
  return iso.replace(/-/g, '/');
}

export function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`不正な日付です: ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** 'YYYY-MM-DD' をUTC 0時のエポックミリ秒に変換する */
export function isoToUtcMs(iso: string): number {
  const { year, month, day } = parseIsoDate(iso);
  return Date.UTC(year, month - 1, day);
}

/** Asia/Tokyo における今日の日付（YYYY-MM-DD） */
export function todayInTokyo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts;
}

/** UTCのISO日時を Asia/Tokyo の 'YYYY/MM/DD HH:mm:ss' で表示する */
export function formatDateTimeTokyo(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  const f = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Asia/Tokyo の日付（YYYY-MM-DD）の範囲 [from, to] をUTCエポックミリ秒の半開区間に変換する */
export function tokyoDateRangeToUtc(
  from: string | null,
  to: string | null,
): { fromMs: number; toMs: number } {
  const JST_OFFSET = 9 * 60 * 60 * 1000;
  const fromMs = from ? isoToUtcMs(from) - JST_OFFSET : Number.NEGATIVE_INFINITY;
  const toMs = to ? isoToUtcMs(to) + 24 * 60 * 60 * 1000 - JST_OFFSET : Number.POSITIVE_INFINITY;
  return { fromMs, toMs };
}
