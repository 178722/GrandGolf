import { describe, expect, it } from 'vitest';
import { ageInDays, calcAge, formatAge } from './age';

describe('年齢計算', () => {
  it('U-AGE-01 画面仕様書の例（55歳176日）', () => {
    expect(calcAge('1971-05-24', '2026-11-16')).toEqual({ years: 55, days: 176 });
  });
  it('U-AGE-02 画面仕様書の例（41歳251日）', () => {
    expect(calcAge('1985-03-10', '2026-11-16')).toEqual({ years: 41, days: 251 });
  });
  it('U-AGE-03 誕生日当日は満年齢0日', () => {
    expect(calcAge('1971-05-24', '2026-05-24')).toEqual({ years: 55, days: 0 });
  });
  it('U-AGE-04 誕生日前日', () => {
    expect(calcAge('1971-05-24', '2026-05-23')).toEqual({ years: 54, days: 364 });
  });
  it('U-AGE-05 2月29日生まれは法律上の扱い（平年は2月28日の終了時に加算）', () => {
    expect(calcAge('2000-02-29', '2025-02-28')).toEqual({ years: 24, days: 365 });
    expect(calcAge('2000-02-29', '2025-03-01')).toEqual({ years: 25, days: 0 });
    expect(calcAge('2000-02-29', '2024-02-29')).toEqual({ years: 24, days: 0 });
    // うるう年の2月28日は誕生日前日（直近の加算は前年＝平年の3月1日）
    expect(calcAge('2000-02-29', '2024-02-28')).toEqual({ years: 23, days: 364 });
  });
  it('U-AGE-09 年をまたぐ場合も直近の誕生日からの日数を数える', () => {
    expect(calcAge('1970-12-31', '2026-01-01')).toEqual({ years: 55, days: 1 });
    expect(calcAge('1970-01-01', '2025-12-31')).toEqual({ years: 55, days: 364 });
  });
  it('U-AGE-06 基準日が生年月日より前は0歳0日', () => {
    expect(calcAge('2030-01-01', '2026-11-16')).toEqual({ years: 0, days: 0 });
  });
  it('U-AGE-07 生年月日から基準日までの日数', () => {
    expect(ageInDays('2026-01-01', '2026-12-31')).toBe(364);
  });
  it('U-AGE-08 「◯歳◯日」形式', () => {
    expect(formatAge({ years: 55, days: 176 })).toBe('55歳176日');
  });
});
