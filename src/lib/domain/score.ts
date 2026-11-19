// スコア計算（要件定義書3.6）

import type { Competition } from '@/types/tournament';

type HoleInOneSetting = Pick<Competition, 'holeInOneConversionEnabled' | 'holeInOneConversionValue'>;

/**
 * 1ホールのスコア。打数が1（ホールインワン）で「変換あり」の場合は、打数を変換値に置き換える
 * （加算・減算のボーナスではなく置き換え）。
 */
export function holeScore(strokes: number, setting: HoleInOneSetting): number {
  if (strokes === 1 && setting.holeInOneConversionEnabled && setting.holeInOneConversionValue !== null) {
    return setting.holeInOneConversionValue;
  }
  return strokes;
}

/** 1ラウンドの合計スコア（8ホール分、ホールインワン変換後） */
export function roundTotal(holes: readonly number[], setting: HoleInOneSetting): number {
  return holes.reduce((sum, s) => sum + holeScore(s, setting), 0);
}

/** 総合スコア（保存済みラウンドの合計の総和）。保存済みラウンドが無い場合は null */
export function overallTotal(rounds: readonly (readonly number[])[], setting: HoleInOneSetting): number | null {
  if (rounds.length === 0) return null;
  return rounds.reduce((sum, holes) => sum + roundTotal(holes, setting), 0);
}
