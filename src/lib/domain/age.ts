// 年齢計算（画面仕様書A6「年齢」、要件定義書3.7の年齢による順位決定）

import { isExistingDate, isoToUtcMs, parseIsoDate } from './dates';

const DAY_MS = 86_400_000;

export type Age = { years: number; days: number };

/**
 * 基準日（大会の開催日）時点の年齢を「満年齢＋直近の誕生日からの日数」で返す。
 * 年齢計算ニ関スル法律・民法143条に従い、誕生日の前日が終了した時点（＝誕生日当日）で1歳加算する。
 * 2月29日生まれの場合、平年は応当日がないため2月28日（月の末日）の終了時に加算する。
 * 日付単位では「平年は3月1日から新しい年齢・0日」となる。
 * 基準日が生年月日より前の場合は 0歳0日 とする。
 */
export function calcAge(birthDate: string, asOfDate: string): Age {
  const birth = parseIsoDate(birthDate);
  const asOf = parseIsoDate(asOfDate);
  const asOfMs = isoToUtcMs(asOfDate);
  if (asOfMs < isoToUtcMs(birthDate)) return { years: 0, days: 0 };

  const birthdayMs = (year: number) =>
    isExistingDate(year, birth.month, birth.day)
      ? Date.UTC(year, birth.month - 1, birth.day)
      : Date.UTC(year, 2, 1); // 2/29生まれの平年は2/28終了時に加算＝3/1から新しい年齢

  let years = asOf.year - birth.year;
  let lastBirthday = birthdayMs(asOf.year);
  if (asOfMs < lastBirthday) {
    years -= 1;
    lastBirthday = birthdayMs(asOf.year - 1);
  }
  return { years, days: Math.round((asOfMs - lastBirthday) / DAY_MS) };
}

export function formatAge(age: Age): string {
  return `${age.years}歳${age.days}日`;
}

/** 生年月日から基準日までの経過日数（年齢の厳密な比較に使用） */
export function ageInDays(birthDate: string, asOfDate: string): number {
  return Math.round((isoToUtcMs(asOfDate) - isoToUtcMs(birthDate)) / DAY_MS);
}
