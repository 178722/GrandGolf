// 順位表作成（要件定義書3.7）
//
// 個人戦の順位決定：1. 総合スコアが小さい 2. 年齢が上（生年月日が早い） 3. じゃんけん
// チーム戦（平均）：1. チームの平均スコアが小さい 2. チームの合計年齢が上 3. じゃんけん
// チーム戦（合計）：1. チームの合計スコアが小さい 2. チームの合計年齢が上 3. じゃんけん
// 「じゃんけん」はシステム外で行うため、1・2で決着しない組は同順位・じゃんけん待ちとし、管理者が手動確定する。

import type {
  Competition,
  IndividualRankingRow,
  Player,
  RankingSnapshot,
  Score,
  TeamRankingRow,
} from '@/types/tournament';
import { ageInDays, calcAge } from './age';
import { roundTotal } from './score';

export type RankingInput = {
  players: readonly Player[];
  scores: readonly Score[];
  competition: Competition;
  /** 大会の開催日（年齢の基準日） */
  tournamentDate: string;
};

export type ComputedRanking = Omit<RankingSnapshot, 'tournamentId' | 'createdAt'>;

/**
 * 比較関数 cmp（負なら a が上位、0なら同順位）に基づき、同順位ありの順位（1,2,2,4…）を付与する。
 */
function assignRanks<T>(
  items: T[],
  cmp: (a: T, b: T) => number,
): (T & { rank: number; tieRank: number; tieSize: number; jankenPending: boolean })[] {
  const sorted = [...items].sort(cmp);
  const result: (T & { rank: number; tieRank: number; tieSize: number; jankenPending: boolean })[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && cmp(sorted[i], sorted[j]) === 0) j++;
    const size = j - i;
    for (let k = i; k < j; k++) {
      result.push({ ...sorted[k], rank: i + 1, tieRank: i + 1, tieSize: size, jankenPending: size > 1 });
    }
    i = j;
  }
  return result;
}

export function computeRankings({ players, scores, competition, tournamentDate }: RankingInput): ComputedRanking {
  const rounds = competition.rounds;

  // 全ラウンド分のスコアが保存済みの選手のみ集計対象
  const eligible: { player: Player; total: number }[] = [];
  const excludedPlayerNames: string[] = [];
  const sortedPlayers = [...players].sort((a, b) => a.order - b.order);
  for (const player of sortedPlayers) {
    // 不参加の選手は組合せ表に含まれないため、順位表の対象外（集計対象外の一覧にも表示しない）
    if (player.absent) continue;
    const own = scores.filter((s) => s.playerId === player.id);
    const complete = Array.from({ length: rounds }, (_, i) => i + 1).every((r) =>
      own.some((s) => s.round === r),
    );
    if (!complete) {
      excludedPlayerNames.push(player.name);
      continue;
    }
    const total = own
      .filter((s) => s.round >= 1 && s.round <= rounds)
      .reduce((sum, s) => sum + roundTotal(s.holes, competition), 0);
    eligible.push({ player, total });
  }

  // 個人戦
  const individualBase = eligible.map(({ player, total }) => ({
    playerId: player.id,
    playerName: player.name,
    teamName: player.teamName,
    totalScore: total,
    birthDate: player.birthDate,
  }));
  const individual: IndividualRankingRow[] = assignRanks(individualBase, (a, b) => {
    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
    // 生年月日が早い（年上）ほど上位。'YYYY-MM-DD' は文字列比較で日付順になる
    if (a.birthDate !== b.birthDate) return a.birthDate < b.birthDate ? -1 : 1;
    return 0;
  });

  // チーム戦
  let team: TeamRankingRow[] | null = null;
  if (competition.teamBattleEnabled && competition.teamRankingMethod) {
    const method = competition.teamRankingMethod;
    const byTeam = new Map<string, { total: number; count: number; years: number; days: number; ageDays: number }>();
    for (const { player, total } of eligible) {
      const name = player.teamName.trim();
      if (!name) continue; // チーム名なしの選手はチーム戦の集計対象外
      const age = calcAge(player.birthDate, tournamentDate);
      const t = byTeam.get(name) ?? { total: 0, count: 0, years: 0, days: 0, ageDays: 0 };
      t.total += total;
      t.count += 1;
      t.years += age.years;
      t.days += age.days;
      t.ageDays += ageInDays(player.birthDate, tournamentDate);
      byTeam.set(name, t);
    }
    const teamBase = [...byTeam.entries()].map(([teamName, t]) => ({
      teamName,
      memberCount: t.count,
      totalScore: t.total,
      averageScore: t.total / t.count,
      totalAgeYears: t.years,
      totalAgeDays: t.days,
      totalAgeInDays: t.ageDays,
    }));
    team = assignRanks(teamBase, (a, b) => {
      if (method === '合計') {
        if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
      } else {
        // 平均は浮動小数の誤差を避けるため、交差乗算で比較する
        const diff = a.totalScore * b.memberCount - b.totalScore * a.memberCount;
        if (diff !== 0) return diff;
      }
      // 合計年齢が上（大きい）ほど上位
      if (a.totalAgeInDays !== b.totalAgeInDays) return b.totalAgeInDays - a.totalAgeInDays;
      return 0;
    });
  }

  return {
    individual,
    team,
    teamRankingMethod: competition.teamBattleEnabled ? competition.teamRankingMethod : null,
    excludedPlayerNames,
  };
}

export type ManualRankTarget = { kind: 'individual'; playerId: string } | { kind: 'team'; teamName: string };

export type ManualRankResult = { ok: true; snapshot: RankingSnapshot } | { ok: false; message: string };

/**
 * じゃんけん待ちの行の最終順位を手動で確定する（確定状態は記憶せず、順位表を直接上書きする）。
 * 確定できる順位は、その行が属する同順位グループの範囲（tieRank 〜 tieRank+tieSize-1）に限り、
 * 同じグループ内で既に確定済みの順位とは重複できない。
 */
export function applyManualRank(
  snapshot: RankingSnapshot,
  target: ManualRankTarget,
  rank: unknown,
): ManualRankResult {
  type Row = IndividualRankingRow | TeamRankingRow;
  const rows: Row[] | null = target.kind === 'individual' ? snapshot.individual : snapshot.team;
  if (!rows) return { ok: false, message: 'チーム戦の順位表がありません' };

  const index =
    target.kind === 'individual'
      ? (rows as IndividualRankingRow[]).findIndex((r) => r.playerId === target.playerId)
      : (rows as TeamRankingRow[]).findIndex((r) => r.teamName === target.teamName);
  if (index < 0) return { ok: false, message: '対象が順位表に見つかりません' };

  const row = rows[index];
  if (!row.jankenPending) return { ok: false, message: 'じゃんけん待ちではないため手動確定できません' };

  const min = row.tieRank;
  const max = row.tieRank + row.tieSize - 1;
  if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < min || rank > max) {
    return { ok: false, message: `確定する順位は${min}〜${max}の範囲で入力してください` };
  }
  const taken = rows.some((r, i) => i !== index && r.tieRank === row.tieRank && !r.jankenPending && r.rank === rank);
  if (taken) return { ok: false, message: `${rank}位は同じグループ内で既に確定済みです` };

  const updated = rows.map((r, i) => (i === index ? { ...r, rank, jankenPending: false } : r));
  // 順位順に並べ替え（同順位はグループ内で確定済みを先に）
  updated.sort((a, b) => a.rank - b.rank || Number(a.jankenPending) - Number(b.jankenPending));

  return {
    ok: true,
    snapshot:
      target.kind === 'individual'
        ? { ...snapshot, individual: updated as IndividualRankingRow[] }
        : { ...snapshot, team: updated as TeamRankingRow[] },
  };
}
