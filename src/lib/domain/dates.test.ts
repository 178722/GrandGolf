import { describe, expect, it } from 'vitest';
import {
  formatDateTimeTokyo,
  formatSlashDate,
  isValidIsoDate,
  todayInTokyo,
  tokyoDateRangeToUtc,
} from './dates';
import { charLength } from './text';

describe('文字数・日付ユーティリティ', () => {
  it('U-TXT-01 全角・半角を区別せず1文字として数える', () => {
    expect(charLength('定例会abc')).toBe(6);
  });
  it('U-TXT-02 サロゲートペアも1文字として数える', () => {
    expect(charLength('𠮷野家')).toBe(3);
  });
  it('U-DT-01 実在する日付のみ有効', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2023-02-29')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026/11/16')).toBe(false);
  });
  it('U-DT-02 UTCで前日でも日本時間の日付を返す', () => {
    expect(todayInTokyo(new Date('2026-11-16T15:30:00Z'))).toBe('2026-11-17');
    expect(todayInTokyo(new Date('2026-11-16T14:59:59Z'))).toBe('2026-11-16');
  });
  it('U-DT-03 秒単位まで日本時間で表示する', () => {
    expect(formatDateTimeTokyo('2026-11-16T11:00:05Z')).toBe('2026/11/16 20:00:05');
  });
  it('U-DT-04 日本時間の日付範囲を両端を含むUTC区間に変換する', () => {
    const { fromMs, toMs } = tokyoDateRangeToUtc('2026-11-16', '2026-11-16');
    expect(fromMs).toBe(Date.parse('2026-11-15T15:00:00Z'));
    expect(toMs).toBe(Date.parse('2026-11-16T15:00:00Z'));
  });
  it('U-DT-05 未指定の端は無制限', () => {
    const { fromMs, toMs } = tokyoDateRangeToUtc(null, null);
    expect(fromMs).toBe(Number.NEGATIVE_INFINITY);
    expect(toMs).toBe(Number.POSITIVE_INFINITY);
  });
  it('U-DT-06 ISO日付をスラッシュ区切りで表示する', () => {
    expect(formatSlashDate('1971-05-24')).toBe('1971/05/24');
  });
});
