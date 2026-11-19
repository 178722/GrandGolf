import { describe, expect, it } from 'vitest';
import { holeScore, overallTotal, roundTotal } from './score';
import { isValidHoleStrokes, isValidStartHole } from './validation';

const conv = (v: number) => ({ holeInOneConversionEnabled: true, holeInOneConversionValue: v });
const noConv = { holeInOneConversionEnabled: false, holeInOneConversionValue: null };

describe('スコア入力・計算（要件定義書3.6）', () => {
  it('U-SC-01 変換あり・変換値-2：打数1は-2に置き換える', () => expect(holeScore(1, conv(-2))).toBe(-2));
  it('U-SC-02 変換なし：打数1はそのまま', () => expect(holeScore(1, noConv)).toBe(1));
  it('U-SC-03 打数2以上は変換しない', () => {
    expect(holeScore(2, conv(-2))).toBe(2);
    expect(holeScore(99, conv(-5))).toBe(99);
  });
  it('U-SC-04 変換値の境界（-5・0・1）', () => {
    expect(holeScore(1, conv(-5))).toBe(-5);
    expect(holeScore(1, conv(0))).toBe(0);
    expect(holeScore(1, conv(1))).toBe(1);
  });
  it('U-SC-11 変換ありでも変換値が未設定（null）の場合は変換しない（防御）', () => {
    expect(holeScore(1, { holeInOneConversionEnabled: true, holeInOneConversionValue: null })).toBe(1);
  });
  it('U-SC-05 8ホール合計', () => expect(roundTotal([4, 3, 5, 4, 3, 4, 5, 4], noConv)).toBe(32));
  it('U-SC-06 ホールインワンは置き換え（加算・減算ではない）', () => {
    expect(roundTotal([1, 3, 3, 3, 3, 3, 3, 3], conv(-2))).toBe(19);
    expect(roundTotal([1, 3, 3, 3, 3, 3, 3, 3], noConv)).toBe(22);
  });
  it('U-SC-07 複数ホールインワン', () => expect(roundTotal(Array(8).fill(1), conv(-2))).toBe(-16));
  it('U-SC-08 総合スコア＝全ラウンド合計の総和', () => {
    const r1 = [4, 3, 5, 4, 3, 4, 5, 4];
    const r2 = [3, 4, 4, 3, 4, 3, 4, 5];
    expect(overallTotal([r1], noConv)).toBe(32);
    expect(overallTotal([r1, r2], noConv)).toBe(62);
    expect(overallTotal([], noConv)).toBeNull();
  });
  it('U-SC-09 8ホール・各1〜99の整数のみ有効', () => {
    expect(isValidHoleStrokes([1, 2, 3, 4, 5, 6, 7, 99])).toBe(true);
    expect(isValidHoleStrokes([0, 2, 3, 4, 5, 6, 7, 8])).toBe(false);
    expect(isValidHoleStrokes([100, 2, 3, 4, 5, 6, 7, 8])).toBe(false);
    expect(isValidHoleStrokes([1.5, 2, 3, 4, 5, 6, 7, 8])).toBe(false);
    expect(isValidHoleStrokes([1, 2, 3, 4, 5, 6, 7])).toBe(false);
    expect(isValidHoleStrokes([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(false);
    expect(isValidHoleStrokes(['1', 2, 3, 4, 5, 6, 7, 8])).toBe(false);
    expect(isValidHoleStrokes(null)).toBe(false);
  });
  it('U-SC-10 開始ホールは1〜8の整数', () => {
    expect(isValidStartHole(1)).toBe(true);
    expect(isValidStartHole(8)).toBe(true);
    expect(isValidStartHole(0)).toBe(false);
    expect(isValidStartHole(9)).toBe(false);
    expect(isValidStartHole(1.5)).toBe(false);
  });
});
