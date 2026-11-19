// サンプルデータ（samples.ts）から、画面に表示されるべき集計値を求める。
// 要件定義書3.6（ホールインワン変換は「置き換え」）・3.7（個人戦：総合スコア → 生年月日が早い → じゃんけん）の
// 規則だけを用いた素朴な計算で、アプリの実装（src/lib/domain）には依存しない。

import type { E2ECompetition, E2EDataset, E2EPlayer } from './samples';

/** 1ホールのスコア（変換ありで打数1の場合は変換値に置き換える） */
export function holeScore(strokes: number, c: E2ECompetition): number {
  return c.holeInOne && strokes === 1 ? c.holeInOneValue : strokes;
}

/** 1ラウンドの合計スコア */
export function roundScore(holes: number[], c: E2ECompetition): number {
  return holes.reduce((sum, h) => sum + holeScore(h, c), 0);
}

/** 総合スコア（全ラウンドの合計） */
export function totalScore(player: E2EPlayer, c: E2ECompetition): number {
  return (player.rounds ?? []).reduce((sum, r) => sum + roundScore(r, c), 0);
}

/** 組合せ・スコア表のホールセルの表示（変換ありの打数1は「1(-2)」のように変換値を併記。変換値1は併記しない） */
export function holeCellText(strokes: number, c: E2ECompetition): string {
  const s = holeScore(strokes, c);
  return s === strokes ? String(strokes) : `${strokes}(${s})`;
}

export type IndividualExpect = { rank: number; name: string; total: number; janken: boolean };

/**
 * 個人戦の総合順位表（全ラウンドのスコアがある参加選手のみ）。
 * 総合スコアが小さい → 生年月日が早い の順。両方同じ組は同順位・じゃんけん待ち。
 */
export function expectedIndividual(data: E2EDataset, totals: Record<string, number> = {}): IndividualExpect[] {
  const rows = data.players
    .filter((p) => !p.absent && (p.rounds?.length ?? 0) === data.competition.rounds)
    .map((p, order) => ({
      name: p.name,
      birth: p.birthDisplay,
      total: totals[p.name] ?? totalScore(p, data.competition),
      order,
    }));
  const cmp = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    a.total - b.total || (a.birth < b.birth ? -1 : a.birth > b.birth ? 1 : 0);
  rows.sort((a, b) => cmp(a, b) || a.order - b.order);
  return rows.map((r) => {
    const first = rows.findIndex((x) => cmp(x, r) === 0);
    const size = rows.filter((x) => cmp(x, r) === 0).length;
    return { rank: first + 1, name: r.name, total: r.total, janken: size > 1 };
  });
}

/** 選手名 → 選手のスコア（ラウンドごとの8ホール打数）。スコア入力ダイアログで使う */
export function scoreTable(data: E2EDataset): Record<string, number[][]> {
  return Object.fromEntries(data.players.filter((p) => p.rounds).map((p) => [p.name, p.rounds as number[][]]));
}
