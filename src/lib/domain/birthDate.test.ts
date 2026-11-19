import { describe, expect, it } from 'vitest';
import { parseBirthDate } from './birthDate';

describe('生年月日の解析（要件定義書3.3）', () => {
  it('U-BD-01 西暦 YYYY/MM/DD', () => expect(parseBirthDate('1971/05/24')).toBe('1971-05-24'));
  it('U-BD-02 月日が1桁でも可', () => expect(parseBirthDate('1971/5/4')).toBe('1971-05-04'));
  it('U-BD-03 昭和', () => expect(parseBirthDate('S46.05.24')).toBe('1971-05-24'));
  it('U-BD-04 平成元年', () => expect(parseBirthDate('H1.01.08')).toBe('1989-01-08'));
  it('U-BD-05 令和元年', () => expect(parseBirthDate('R1.05.01')).toBe('2019-05-01'));
  it('U-BD-06 元号アルファベットは小文字も可', () => expect(parseBirthDate('s46.5.24')).toBe('1971-05-24'));
  it('U-BD-07 元号の適用期間の境界日は有効', () => {
    expect(parseBirthDate('S1.12.25')).toBe('1926-12-25');
    expect(parseBirthDate('S64.01.07')).toBe('1989-01-07');
    expect(parseBirthDate('H31.04.30')).toBe('2019-04-30');
  });
  it('U-BD-08 元号の適用期間外は無効', () => {
    for (const v of ['S1.12.24', 'S64.01.08', 'H1.01.07', 'H31.05.01', 'R1.04.30']) {
      expect(parseBirthDate(v), v).toBeNull();
    }
  });
  it('U-BD-09 実在しない日付は無効（うるう年考慮）', () => {
    expect(parseBirthDate('2023/02/29')).toBeNull();
    expect(parseBirthDate('2024/02/29')).toBe('2024-02-29');
    expect(parseBirthDate('H3.02.29')).toBeNull(); // 1991年は平年
  });
  it('U-BD-10 不正形式は無効', () => {
    for (const v of ['1971-05-24', '19710524', 'T10.01.01', 'S0.01.01', '', 'S46/05/24', '71/05/24']) {
      expect(parseBirthDate(v), v).toBeNull();
    }
  });
  it('U-BD-12 元号の範囲を超える年は無効', () => {
    expect(parseBirthDate('S70.01.01')).toBeNull();
    expect(parseBirthDate('H32.01.01')).toBeNull();
  });
  it('U-BD-13 未来の生年月日も形式が正しければ受け付ける（要件に未来日の制限なし）', () => {
    expect(parseBirthDate('2030/01/01')).toBe('2030-01-01');
    expect(parseBirthDate('R20.01.01')).toBe('2038-01-01');
  });
  it('U-BD-11 前後の空白は無視する', () => expect(parseBirthDate(' S46.05.24 ')).toBe('1971-05-24'));
});
