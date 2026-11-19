import { describe, expect, it } from 'vitest';
import type { Competition, Player, RankingSnapshot, Score } from '@/types/tournament';
import { applyManualRank, computeRankings } from './ranking';

const DATE = '2026-11-16';
let order = 0;
function player(id: string, birthDate = '1970-01-01', teamName = ''): Player {
  order += 1;
  return { id, tournamentId: 't', name: id, birthDate, teamName, partyFixed: false, partyNumber: null, absent: false, order };
}
/** 合計が total になる8ホール（ホールインワンを含まないよう2以上で構成） */
function holesFor(total: number): number[] {
  const base = Array(8).fill(2);
  base[0] = total - 14;
  if (base[0] < 2) throw new Error('total too small');
  return base;
}
function score(playerId: string, round: number, total: number): Score {
  return { tournamentId: 't', playerId, round, holes: holesFor(total) };
}
function comp(patch: Partial<Competition> = {}): Competition {
  return {
    tournamentId: 't',
    rounds: 1,
    holeInOneConversionEnabled: true,
    holeInOneConversionValue: -2,
    maxPartySize: 6,
    partyAssignmentMethod: 'シャッフル',
    teamBattleEnabled: false,
    teamRankingMethod: null,
    ...patch,
  };
}
const rank = (players: Player[], scores: Score[], c = comp()) =>
  computeRankings({ players, scores, competition: c, tournamentDate: DATE });
const ind = (r: ReturnType<typeof rank>) => r.individual.map((x) => [x.playerId, x.rank, x.jankenPending]);
const tm = (r: ReturnType<typeof rank>) => r.team?.map((x) => [x.teamName, x.rank, x.jankenPending]);

describe('順位決定 個人戦（要件定義書3.7）', () => {
  it('U-RK-01 トータルスコアが小さい順', () => {
    const r = rank([player('A'), player('B'), player('C')], [score('A', 1, 30), score('B', 1, 32), score('C', 1, 28)]);
    expect(ind(r)).toEqual([
      ['C', 1, false],
      ['A', 2, false],
      ['B', 3, false],
    ]);
  });
  it('U-RK-02 同スコアは年齢が上の選手が上位', () => {
    const r = rank([player('A', '1985-03-10'), player('B', '1971-05-24')], [score('A', 1, 30), score('B', 1, 30)]);
    expect(ind(r)).toEqual([
      ['B', 1, false],
      ['A', 2, false],
    ]);
  });
  it('U-RK-02b 生年月日が1日違いでも年上が上位', () => {
    const r = rank([player('A', '1971-05-25'), player('B', '1971-05-24')], [score('A', 1, 30), score('B', 1, 30)]);
    expect(ind(r).map((x) => x[0])).toEqual(['B', 'A']);
  });
  it('U-RK-03 同スコア・同生年月日は同順位でじゃんけん待ち、次の順位は人数分飛ぶ', () => {
    const r = rank([player('A'), player('B'), player('C')], [score('A', 1, 30), score('B', 1, 30), score('C', 1, 31)]);
    expect(ind(r)).toEqual([
      ['A', 1, true],
      ['B', 1, true],
      ['C', 3, false],
    ]);
    expect(r.individual[0].tieSize).toBe(2);
  });
  it('U-RK-03b 途中順位での同点（1,2,2,4）', () => {
    const r = rank(
      [player('A'), player('B'), player('C'), player('D')],
      [score('A', 1, 28), score('B', 1, 30), score('C', 1, 30), score('D', 1, 31)],
    );
    expect(r.individual.map((x) => x.rank)).toEqual([1, 2, 2, 4]);
    expect(r.individual[1]).toMatchObject({ tieRank: 2, tieSize: 2, jankenPending: true });
  });
  it('U-RK-04 1ラウンドでも未保存の選手は除外し、除外者名を返す', () => {
    const r = rank([player('A'), player('B')], [score('A', 1, 30), score('A', 2, 30), score('B', 1, 20)], comp({ rounds: 2 }));
    expect(ind(r)).toEqual([['A', 1, false]]);
    expect(r.excludedPlayerNames).toEqual(['B']);
  });
  it('U-RK-05 複数ラウンドの合計で順位を決める', () => {
    const r = rank(
      [player('A'), player('B')],
      [score('A', 1, 30), score('A', 2, 40), score('B', 1, 35), score('B', 2, 33)],
      comp({ rounds: 2 }),
    );
    expect(r.individual.map((x) => [x.playerId, x.totalScore])).toEqual([
      ['B', 68],
      ['A', 70],
    ]);
  });
  it('U-RK-06 ホールインワン変換後のスコアで集計する', () => {
    const hio: Score = { tournamentId: 't', playerId: 'A', round: 1, holes: [1, 3, 3, 3, 3, 3, 3, 3] };
    expect(rank([player('A')], [hio]).individual[0].totalScore).toBe(19);
    expect(rank([player('A')], [hio], comp({ holeInOneConversionEnabled: false, holeInOneConversionValue: null })).individual[0].totalScore).toBe(22);
  });
  it('U-RK-07 チーム戦なしの場合はチーム順位表を作らない', () => {
    expect(rank([player('A', '1970-01-01', '東')], [score('A', 1, 30)]).team).toBeNull();
  });
  it('U-RK-17 選手0名・スコア0件でもエラーにならない', () => {
    const r = rank([], [], comp({ teamBattleEnabled: true, teamRankingMethod: '合計' }));
    expect(r).toEqual({ individual: [], team: [], teamRankingMethod: '合計', excludedPlayerNames: [] });
  });
  it('U-RK-18 3名以上の同順位グループ', () => {
    const r = rank([player('A'), player('B'), player('C')], [score('A', 1, 30), score('B', 1, 30), score('C', 1, 30)]);
    expect(r.individual.every((x) => x.rank === 1 && x.tieSize === 3 && x.jankenPending)).toBe(true);
  });
  it('U-RK-19 範囲外ラウンドのスコアは合計に含めない', () => {
    const r = rank([player('A')], [score('A', 1, 30), score('A', 2, 99)], comp({ rounds: 1 }));
    expect(r.individual[0].totalScore).toBe(30);
  });
  it('U-RK-20 選手一覧にいない選手のスコアは無視する', () => {
    const r = rank([player('A')], [score('A', 1, 30), score('GHOST', 1, 20)]);
    expect(ind(r)).toEqual([['A', 1, false]]);
  });
});

describe('順位決定 チーム戦（要件定義書3.7）', () => {
  const sum = comp({ teamBattleEnabled: true, teamRankingMethod: '合計' });
  const avg = comp({ teamBattleEnabled: true, teamRankingMethod: '平均' });

  it('U-RK-08 チーム戦（合計）：チームの合計スコアが小さい順', () => {
    const ps = [player('E1', '1970-01-01', '東'), player('E2', '1970-01-01', '東'), player('W1', '1970-01-01', '西'), player('W2', '1970-01-01', '西')];
    const r = rank(ps, [score('E1', 1, 30), score('E2', 1, 30), score('W1', 1, 29), score('W2', 1, 29)], sum);
    expect(tm(r)).toEqual([
      ['西', 1, false],
      ['東', 2, false],
    ]);
    expect(r.team?.[0]).toMatchObject({ totalScore: 58, memberCount: 2, averageScore: 29 });
  });
  it('U-RK-09 チーム戦（平均）：平均が小さい順（人数差で合計と逆転）', () => {
    const ps = [
      player('E1', '1970-01-01', '東'),
      player('E2', '1970-01-01', '東'),
      player('E3', '1970-01-01', '東'),
      player('W1', '1970-01-01', '西'),
      player('W2', '1970-01-01', '西'),
    ];
    const scores = [score('E1', 1, 30), score('E2', 1, 30), score('E3', 1, 30), score('W1', 1, 31), score('W2', 1, 31)];
    expect(tm(rank(ps, scores, avg))).toEqual([
      ['東', 1, false],
      ['西', 2, false],
    ]);
    expect(tm(rank(ps, scores, sum))).toEqual([
      ['西', 1, false],
      ['東', 2, false],
    ]);
  });
  it('U-RK-10 同スコアはチームの合計年齢が上のチームが上位', () => {
    const ps = [player('E1', '1990-01-01', '東'), player('W1', '1950-01-01', '西')];
    const r = rank(ps, [score('E1', 1, 30), score('W1', 1, 30)], sum);
    expect(tm(r)).toEqual([
      ['西', 1, false],
      ['東', 2, false],
    ]);
  });
  it('U-RK-11 合計年齢も同じ場合は同順位・じゃんけん待ち', () => {
    const ps = [player('E1', '1970-01-01', '東'), player('W1', '1970-01-01', '西')];
    const r = rank(ps, [score('E1', 1, 30), score('W1', 1, 30)], sum);
    expect(tm(r)).toEqual([
      ['東', 1, true],
      ['西', 1, true],
    ]);
  });
  it('U-RK-12 除外選手はチームの合計・平均・年齢合計から除く', () => {
    const ps = [player('E1', '1970-01-01', '東'), player('E2', '1970-01-01', '東'), player('E3', '1940-01-01', '東')];
    const r = rank(ps, [score('E1', 1, 30), score('E2', 1, 32)], avg);
    expect(r.team?.[0]).toMatchObject({ teamName: '東', memberCount: 2, totalScore: 62, averageScore: 31, totalAgeYears: 112 });
    expect(r.excludedPlayerNames).toEqual(['E3']);
  });
  it('U-RK-13 チームの全選手が除外された場合、そのチーム自体を除外する', () => {
    const ps = [player('E1', '1970-01-01', '東'), player('W1', '1970-01-01', '西')];
    const r = rank(ps, [score('E1', 1, 30)], sum);
    expect(r.team?.map((x) => x.teamName)).toEqual(['東']);
  });
  it('U-RK-14 チーム名なしの選手はチーム戦の対象外（個人戦には含む。データ不整合時の防御）', () => {
    const ps = [player('E1', '1970-01-01', '東'), player('X', '1970-01-01', '')];
    const r = rank(ps, [score('E1', 1, 30), score('X', 1, 20)], sum);
    expect(r.individual.map((x) => x.playerId)).toEqual(['X', 'E1']);
    expect(r.team?.map((x) => x.teamName)).toEqual(['東']);
  });
  it('U-RK-15 平均の比較は浮動小数誤差の影響を受けない', () => {
    // 東：3名で合計100（平均33.33…）、西：6名で合計200（平均33.33…）→ 同平均。年齢で決まる
    const east = [0, 1, 2].map((i) => player(`E${i}`, '1990-01-01', '東'));
    const west = [0, 1, 2, 3, 4, 5].map((i) => player(`W${i}`, '1990-01-01', '西'));
    const scores = [
      score('E0', 1, 33), score('E1', 1, 33), score('E2', 1, 34),
      score('W0', 1, 33), score('W1', 1, 33), score('W2', 1, 34), score('W3', 1, 33), score('W4', 1, 33), score('W5', 1, 34),
    ];
    const r = rank([...east, ...west], scores, avg);
    // 平均が同点 → 合計年齢（人数の多い西が上）で決定し、じゃんけん待ちにならない
    expect(tm(r)).toEqual([
      ['西', 1, false],
      ['東', 2, false],
    ]);
  });
  it('U-RK-16 合計年齢は生年月日からの日数合計で比較する', () => {
    // 東：60歳300日＋60歳300日＝120歳600日、西：121歳0日＋0歳… 同人数で比較
    const ps = [
      player('E1', '1966-01-20', '東'), // 2026-11-16時点 60歳300日
      player('E2', '1966-01-20', '東'),
      player('W1', '1965-11-16', '西'), // 61歳0日
      player('W2', '1966-11-16', '西'), // 60歳0日
    ];
    const r = rank(ps, [score('E1', 1, 30), score('E2', 1, 30), score('W1', 1, 30), score('W2', 1, 30)], sum);
    const east = r.team?.find((x) => x.teamName === '東');
    const west = r.team?.find((x) => x.teamName === '西');
    expect([east?.totalAgeYears, east?.totalAgeDays]).toEqual([120, 600]);
    expect([west?.totalAgeYears, west?.totalAgeDays]).toEqual([121, 0]);
    // 「歳」の合計は西が大きいが、日数合計は東が大きいため東が上位
    expect(tm(r)?.[0]).toEqual(['東', 1, false]);
  });
  it('U-RK-22 不参加の選手は順位表（個人戦・チーム戦）の対象外で、集計対象外の一覧にも表示しない', () => {
    const absent = (id: string) => ({ ...player(id, '1940-01-01', '東'), absent: true });
    const ps = [player('E1', '1970-01-01', '東'), absent('E2'), absent('E3')];
    // E2はスコアが残っていても対象外、E3はスコアなしでも除外者一覧に出さない
    const r = rank(ps, [score('E1', 1, 30), score('E2', 1, 20)], sum);
    expect(ind(r)).toEqual([['E1', 1, false]]);
    expect(r.excludedPlayerNames).toEqual([]);
    expect(r.team?.[0]).toMatchObject({ teamName: '東', memberCount: 1, totalScore: 30, totalAgeYears: 56 });
  });
  it('U-RK-21 平均同点・人数違いのチームは合計年齢で決まる（人数の多いチームが上位になりやすい）', () => {
    const ps = [
      player('E1', '1970-01-01', '東'), player('E2', '1970-01-01', '東'), player('E3', '1970-01-01', '東'),
      player('W1', '1970-01-01', '西'), player('W2', '1970-01-01', '西'),
    ];
    const scores = [score('E1', 1, 30), score('E2', 1, 30), score('E3', 1, 30), score('W1', 1, 30), score('W2', 1, 30)];
    expect(tm(rank(ps, scores, avg))).toEqual([
      ['東', 1, false],
      ['西', 2, false],
    ]);
  });
});

describe('最終順位の手動確定（要件定義書3.7）', () => {
  function snapshotOf(players: Player[], scores: Score[], c = comp()): RankingSnapshot {
    return { tournamentId: 't', createdAt: '2026-11-16T00:00:00Z', ...rank(players, scores, c) };
  }
  const tie2 = () => snapshotOf([player('A'), player('B'), player('C')], [score('A', 1, 30), score('B', 1, 30), score('C', 1, 31)]);

  it('U-MR-01 じゃんけん待ちの行を同順位グループの範囲内で確定する', () => {
    const res = applyManualRank(tie2(), { kind: 'individual', playerId: 'A' }, 2);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.snapshot.individual.map((x) => [x.playerId, x.rank, x.jankenPending])).toEqual([
        ['B', 1, true],
        ['A', 2, false],
        ['C', 3, false],
      ]);
    }
  });
  it('U-MR-02 範囲外の順位はエラー', () => {
    const res = applyManualRank(tie2(), { kind: 'individual', playerId: 'A' }, 3);
    expect(res).toEqual({ ok: false, message: '確定する順位は1〜2の範囲で入力してください' });
  });
  it('U-MR-03 じゃんけん待ちでない行はエラー（確定済みの行の再確定を含む。やり直しは順位表作成で行う）', () => {
    expect(applyManualRank(tie2(), { kind: 'individual', playerId: 'C' }, 3).ok).toBe(false);
    const first = applyManualRank(tie2(), { kind: 'individual', playerId: 'A' }, 1);
    if (!first.ok) throw new Error();
    expect(applyManualRank(first.snapshot, { kind: 'individual', playerId: 'A' }, 2).ok).toBe(false);
  });
  it('U-MR-04 同じグループで確定済みの順位とは重複できない', () => {
    const first = applyManualRank(tie2(), { kind: 'individual', playerId: 'A' }, 1);
    if (!first.ok) throw new Error();
    expect(applyManualRank(first.snapshot, { kind: 'individual', playerId: 'B' }, 1)).toEqual({
      ok: false,
      message: '1位は同じグループ内で既に確定済みです',
    });
    expect(applyManualRank(first.snapshot, { kind: 'individual', playerId: 'B' }, 2).ok).toBe(true);
  });
  it('U-MR-05 整数以外はエラー', () => {
    expect(applyManualRank(tie2(), { kind: 'individual', playerId: 'A' }, 1.5).ok).toBe(false);
    expect(applyManualRank(tie2(), { kind: 'individual', playerId: 'A' }, '1').ok).toBe(false);
  });
  it('U-MR-06 チーム戦の行も確定できる', () => {
    const snap = snapshotOf(
      [player('E1', '1970-01-01', '東'), player('W1', '1970-01-01', '西')],
      [score('E1', 1, 30), score('W1', 1, 30)],
      comp({ teamBattleEnabled: true, teamRankingMethod: '合計' }),
    );
    const res = applyManualRank(snap, { kind: 'team', teamName: '西' }, 1);
    expect(res.ok && res.snapshot.team?.map((x) => [x.teamName, x.rank, x.jankenPending])).toEqual([
      ['西', 1, false],
      ['東', 1, true],
    ]);
  });
  it('U-MR-07 チーム順位表がない場合、チームの確定はエラー', () => {
    expect(applyManualRank(tie2(), { kind: 'team', teamName: '東' }, 1).ok).toBe(false);
  });
  it('U-MR-08 順位表にない対象はエラー', () => {
    expect(applyManualRank(tie2(), { kind: 'individual', playerId: 'ZZZ' }, 1).ok).toBe(false);
  });
  it('U-MR-09 元の順位表オブジェクトを変更しない', () => {
    const snap = tie2();
    const copy = JSON.parse(JSON.stringify(snap));
    applyManualRank(snap, { kind: 'individual', playerId: 'A' }, 2);
    expect(snap).toEqual(copy);
  });
  it('U-MR-10 3名タイを順に確定できる（確定済みが先に並び、残りはじゃんけん待ち）', () => {
    let snap = snapshotOf([player('A'), player('B'), player('C')], [score('A', 1, 30), score('B', 1, 30), score('C', 1, 30)]);
    const r1 = applyManualRank(snap, { kind: 'individual', playerId: 'C' }, 1);
    if (!r1.ok) throw new Error(r1.message);
    snap = r1.snapshot;
    expect(snap.individual.map((x) => [x.playerId, x.rank, x.jankenPending])).toEqual([
      ['C', 1, false],
      ['A', 1, true],
      ['B', 1, true],
    ]);
    const r2 = applyManualRank(snap, { kind: 'individual', playerId: 'A' }, 3);
    if (!r2.ok) throw new Error(r2.message);
    const r3 = applyManualRank(r2.snapshot, { kind: 'individual', playerId: 'B' }, 2);
    expect(r3.ok && r3.snapshot.individual.map((x) => [x.playerId, x.rank])).toEqual([
      ['C', 1],
      ['B', 2],
      ['A', 3],
    ]);
  });
});
