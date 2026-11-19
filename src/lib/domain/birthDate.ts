// 生年月日の入力解析（要件定義書3.3）
// 入力形式：西暦 YYYY/MM/DD、または和暦略アルファベット YY.MM.DD（S：昭和、H：平成、R：令和）

import { isExistingDate, isoToUtcMs, toIsoDate } from './dates';

type Era = { start: string; end: string | null; firstYear: number };

// 各元号の西暦開始年（元年）と適用期間
const ERAS: Record<'S' | 'H' | 'R', Era> = {
  S: { firstYear: 1926, start: '1926-12-25', end: '1989-01-07' },
  H: { firstYear: 1989, start: '1989-01-08', end: '2019-04-30' },
  R: { firstYear: 2019, start: '2019-05-01', end: null },
};

const SEIREKI = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
const WAREKI = /^([SHRshr])(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/;

/**
 * 生年月日の入力文字列を解析し、西暦の 'YYYY-MM-DD' を返す。不正な場合は null。
 * 前後の空白は無視する。和暦の場合は元号の適用期間外の日付（例：S64.02.01）を不正とする。
 */
export function parseBirthDate(input: string): string | null {
  const value = input.trim();

  const s = SEIREKI.exec(value);
  if (s) {
    const [y, m, d] = [Number(s[1]), Number(s[2]), Number(s[3])];
    return isExistingDate(y, m, d) ? toIsoDate(y, m, d) : null;
  }

  const w = WAREKI.exec(value);
  if (w) {
    const era = ERAS[w[1].toUpperCase() as 'S' | 'H' | 'R'];
    const eraYear = Number(w[2]);
    if (eraYear < 1) return null;
    const y = era.firstYear + eraYear - 1;
    const [m, d] = [Number(w[3]), Number(w[4])];
    if (!isExistingDate(y, m, d)) return null;
    const iso = toIsoDate(y, m, d);
    const ms = isoToUtcMs(iso);
    if (ms < isoToUtcMs(era.start)) return null;
    if (era.end && ms > isoToUtcMs(era.end)) return null;
    return iso;
  }

  return null;
}
