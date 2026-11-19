import { describe, expect, it } from 'vitest';
import type { Player } from '@/types/tournament';
import { assignStartGroups, assignStartHoles, unavailableStartHoles, generatePairings, PAIRING_MESSAGES, shuffle } from './pairing';

let seq = 0;
function p(name: string, opts: Partial<Player> = {}): Player {
  seq += 1;
  return {
    id: opts.id ?? name,
    tournamentId: 't',
    name,
    birthDate: '1970-01-01',
    teamName: '',
    partyFixed: false,
    partyNumber: null,
    absent: false,
    order: seq,
    ...opts,
  };
}
const team = (max = 6) => ({ maxPartySize: max, partyAssignmentMethod: 'チーム' as const });
const shuffleC = (max = 6) => ({ maxPartySize: max, partyAssignmentMethod: 'シャッフル' as const });

/** 決定的な疑似乱数（線形合同法） */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function okParties(res: ReturnType<typeof generatePairings>) {
  if (!res.ok) throw new Error(res.message);
  return res.parties;
}

describe('組合せ表自動生成（要件定義書3.4）', () => {
  it('U-PR-01 競技情報が未登録の場合はエラー', () => {
    const r = generatePairings([p('A'), p('B')], null);
    expect(r).toEqual({ ok: false, message: PAIRING_MESSAGES.noCompetition });
  });

  it('U-PR-02 参加選手数が1以下はエラー、2名は生成可', () => {
    expect(generatePairings([], shuffleC()).ok).toBe(false);
    expect(generatePairings([p('A')], shuffleC())).toEqual({ ok: false, message: PAIRING_MESSAGES.tooFewPlayers });
    expect(generatePairings([p('A'), p('B')], shuffleC()).ok).toBe(true);
  });

  it('U-PR-03 チーム方式：固定選手は指定番号に確定し、空き枠に収まるチームを固定パーティへ入れる', () => {
    const players = [
      p('F1', { partyFixed: true, partyNumber: 1, teamName: '東' }),
      p('F2', { partyFixed: true, partyNumber: 1, teamName: '東' }),
      p('U1', { teamName: '東' }),
      p('U2', { teamName: '東' }),
      p('U3', { teamName: '東' }),
    ];
    const parties = okParties(generatePairings(players, team(6)));
    expect(parties.map((x) => [x.partyNumber, x.playerIds])).toEqual([[1, ['F1', 'F2', 'U1', 'U2', 'U3']]]);
  });

  it('U-PR-03g チーム方式（固定あり）：固定パーティには収まる1チームだけを入れ、残りは1チーム＝1パーティで新規採番', () => {
    const players = [
      p('F1', { partyFixed: true, partyNumber: 1, teamName: 'Z' }),
      p('F2', { partyFixed: true, partyNumber: 1, teamName: 'Z' }),
      p('B1', { teamName: 'B' }),
      p('B2', { teamName: 'B' }),
      p('B3', { teamName: 'B' }),
      p('B4', { teamName: 'B' }),
      p('B5', { teamName: 'B' }),
      p('A1', { teamName: 'A' }),
      p('A2', { teamName: 'A' }),
      p('A3', { teamName: 'A' }),
      p('C1', { teamName: 'C' }),
    ];
    // 最大6・空き枠4：B（5名）は収まらないため、登録順で最初に収まるA（3名）が入る。Cは同じパーティに混ぜない
    const parties = okParties(generatePairings(players, team(6)));
    expect(parties.map((x) => [x.partyNumber, x.playerIds])).toEqual([
      [1, ['F1', 'F2', 'A1', 'A2', 'A3']],
      [2, ['B1', 'B2', 'B3', 'B4', 'B5']],
      [3, ['C1']],
    ]);
  });

  it('U-PR-03h チーム方式（固定あり）：固定選手と同じチーム名のチームを優先して固定パーティへ入れる', () => {
    const players = [
      p('F1', { partyFixed: true, partyNumber: 2, teamName: '西' }),
      p('E1', { teamName: '東' }),
      p('W1', { teamName: '西' }),
      p('W2', { teamName: '西' }),
    ];
    const parties = okParties(generatePairings(players, team(6)));
    expect(parties.map((x) => [x.partyNumber, x.playerIds])).toEqual([
      [1, ['E1']],
      [2, ['F1', 'W1', 'W2']],
    ]);
  });

  it('U-PR-03j チーム方式（固定あり）：固定選手と同じチーム名のチームが空き枠に収まらない場合は、登録順で最初に収まる別チームを入れる', () => {
    const players = [
      ...[1, 2, 3, 4].map((i) => p(`F${i}`, { partyFixed: true, partyNumber: 1, teamName: '西' })),
      p('W1', { teamName: '西' }),
      p('W2', { teamName: '西' }),
      p('W3', { teamName: '西' }),
      p('E1', { teamName: '東' }),
      p('E2', { teamName: '東' }),
    ];
    // 最大6・空き枠2：同名の西（3名）は収まらないため東（2名）が入り、西は新規パーティ
    const parties = okParties(generatePairings(players, team(6)));
    expect(parties.map((x) => [x.partyNumber, x.playerIds])).toEqual([
      [1, ['F1', 'F2', 'F3', 'F4', 'E1', 'E2']],
      [2, ['W1', 'W2', 'W3']],
    ]);
  });

  it('U-PR-03k チーム方式（固定あり）：空き枠のない（最大人数に達した）固定パーティにはチームを入れない', () => {
    const players = [
      ...[1, 2, 3].map((i) => p(`F${i}`, { partyFixed: true, partyNumber: 1, teamName: '東' })),
      p('E1', { teamName: '東' }),
    ];
    const parties = okParties(generatePairings(players, team(3)));
    expect(parties.map((x) => [x.partyNumber, x.playerIds])).toEqual([
      [1, ['F1', 'F2', 'F3']],
      [2, ['E1']],
    ]);
  });

  it('U-PR-03l シャッフル：人数が同数のパーティは、パーティ番号より固定パーティを優先する', () => {
    const players = [p('F2', { partyFixed: true, partyNumber: 2 }), ...Array.from({ length: 4 }, (_, i) => p(`U${i}`))];
    // 全5名・最大3 → パーティ数2（固定2＋新規1）。同数のときは固定パーティ2が優先されるため 1:2名、2:3名
    for (const seed of [1, 2, 3]) {
      const parties = okParties(generatePairings(players, shuffleC(3), seeded(seed)));
      expect(parties.map((x) => [x.partyNumber, x.playerIds.length])).toEqual([
        [1, 2],
        [2, 3],
      ]);
      expect(parties[1].playerIds[0]).toBe('F2');
    }
  });

  it('U-PR-03i 不参加の選手は組合せ対象から除外し、参加選手数の判定にも含めない', () => {
    const players = [p('A'), p('B', { absent: true }), p('C'), p('D', { absent: true, partyFixed: true, partyNumber: 1 })];
    const parties = okParties(generatePairings(players, shuffleC(6), seeded(1)));
    expect(parties.flatMap((x) => x.playerIds).sort()).toEqual(['A', 'C']);
    expect(generatePairings([p('A'), p('B', { absent: true })], shuffleC())).toEqual({
      ok: false,
      message: PAIRING_MESSAGES.tooFewPlayers,
    });
  });

  it('U-PR-03b シャッフル：固定パーティにチーム名の違う非固定選手も入る（固定選手が先頭）', () => {
    const players = [
      p('F1', { partyFixed: true, partyNumber: 1, teamName: 'チームA' }),
      p('U1', { teamName: 'チームB' }),
    ];
    const parties = okParties(generatePairings(players, shuffleC(3), seeded(1)));
    expect(parties.map((x) => [x.partyNumber, x.playerIds])).toEqual([[1, ['F1', 'U1']]]);
  });

  it('U-PR-03c シャッフル：固定パーティ＋未使用番号の新規パーティで人数を平均化し、満員の固定パーティには追加しない', () => {
    const players = [
      p('F3', { partyFixed: true, partyNumber: 3 }),
      p('F1a', { partyFixed: true, partyNumber: 1 }),
      p('F1b', { partyFixed: true, partyNumber: 1 }),
      p('F1c', { partyFixed: true, partyNumber: 1 }),
      ...Array.from({ length: 6 }, (_, i) => p(`U${i}`)),
    ];
    // 全10名・最大3 → パーティ数4（平均2.5）。パーティ1は満員のため追加なし、残りの3パーティで6名を平均化
    const parties = okParties(generatePairings(players, shuffleC(3), seeded(3)));
    expect(parties.map((x) => [x.partyNumber, x.playerIds.length])).toEqual([
      [1, 3],
      [2, 2],
      [3, 3],
      [4, 2],
    ]);
    expect(parties[0].playerIds).toEqual(['F1a', 'F1b', 'F1c']);
    expect(parties[2].playerIds[0]).toBe('F3');
    const all = parties.flatMap((x) => x.playerIds);
    expect(all.length).toBe(10);
    expect(new Set(all).size).toBe(10);
  });

  it('U-PR-03d シャッフル：固定パーティだけで足りる場合は新規パーティを作らない（同数なら番号の小さい固定パーティ）', () => {
    const players = [
      p('F1', { partyFixed: true, partyNumber: 1 }),
      p('F2', { partyFixed: true, partyNumber: 2 }),
      p('U1'),
    ];
    const parties = okParties(generatePairings(players, shuffleC(4), seeded(1)));
    expect(parties.map((x) => [x.partyNumber, x.playerIds])).toEqual([
      [1, ['F1', 'U1']],
      [2, ['F2']],
    ]);
  });

  it('U-PR-03e シャッフル：固定ありでも各パーティの人数を平均（全選手数÷パーティ数）に揃える', () => {
    const players = [p('F1', { partyFixed: true, partyNumber: 1 }), ...Array.from({ length: 7 }, (_, i) => p(`U${i}`))];
    // 全8名・最大6 → パーティ数2、平均4
    const parties = okParties(generatePairings(players, shuffleC(6), seeded(4)));
    expect(parties.map((x) => [x.partyNumber, x.playerIds.length])).toEqual([
      [1, 4],
      [2, 4],
    ]);
    expect(parties[0].playerIds[0]).toBe('F1');
  });

  it('U-PR-03f シャッフル：固定パーティ数が「全選手数÷最大人数」の切り上げより多い場合は固定パーティだけに振り分ける', () => {
    const players = [
      p('F1', { partyFixed: true, partyNumber: 1 }),
      p('F2', { partyFixed: true, partyNumber: 2 }),
      p('F3', { partyFixed: true, partyNumber: 3 }),
      p('U1'),
      p('U2'),
    ];
    const parties = okParties(generatePairings(players, shuffleC(6), seeded(1)));
    expect(parties.map((x) => [x.partyNumber, x.playerIds.length])).toEqual([
      [1, 2],
      [2, 2],
      [3, 1],
    ]);
  });

  it('U-PR-04 新規パーティは固定が使っていない番号を1から順に採番する', () => {
    const players = [
      p('F1', { partyFixed: true, partyNumber: 1, teamName: 'X' }),
      p('F3', { partyFixed: true, partyNumber: 3, teamName: 'X' }),
      p('A1', { teamName: '赤' }),
      p('B1', { teamName: '青' }),
      p('C1', { teamName: '黄' }),
    ];
    const parties = okParties(generatePairings(players, team()));
    // 固定パーティ1・3には登録順にA・Bが入り、残るCは未使用の2番
    expect(parties.map((x) => [x.partyNumber, x.playerIds])).toEqual([
      [1, ['F1', 'A1']],
      [2, ['C1']],
      [3, ['F3', 'B1']],
    ]);
  });

  it('U-PR-05 チーム方式：同一チームを1パーティにまとめ、複数チームを混在させない', () => {
    const players = [p('A1', { teamName: 'A' }), p('A2', { teamName: 'A' }), p('B1', { teamName: 'B' }), p('B2', { teamName: 'B' }), p('B3', { teamName: 'B' })];
    const parties = okParties(generatePairings(players, team(6)));
    expect(parties.map((x) => x.playerIds)).toEqual([
      ['A1', 'A2'],
      ['B1', 'B2', 'B3'],
    ]);
  });

  it('U-PR-06 チーム方式：チームの採番順・パーティ内の並びは登録順', () => {
    const players = [p('B1', { teamName: 'B' }), p('A1', { teamName: 'A' }), p('B2', { teamName: 'B' })];
    const parties = okParties(generatePairings(players, team()));
    expect(parties.map((x) => [x.partyNumber, x.playerIds])).toEqual([
      [1, ['B1', 'B2']],
      [2, ['A1']],
    ]);
  });

  it('U-PR-07 チーム方式：同一チームの人数が最大を超えるとエラー（文言一致）', () => {
    const players = Array.from({ length: 7 }, (_, i) => p(`E${i}`, { teamName: '東' }));
    expect(generatePairings(players, team(6))).toEqual({
      ok: false,
      message: 'チーム『東』の人数がパーティの最大人数を超えています。選手情報またはパーティの最大人数を見直してください。',
    });
  });

  it('U-PR-08 チーム方式：人数が最大と同数は可', () => {
    const players = Array.from({ length: 6 }, (_, i) => p(`E${i}`, { teamName: '東' }));
    expect(okParties(generatePairings(players, team(6)))).toHaveLength(1);
  });

  it('U-PR-09 チーム方式：チーム名未入力の非固定選手がいるとエラー（文言一致）', () => {
    const players = [p('A1', { teamName: 'A' }), p('X', { teamName: '' })];
    expect(generatePairings(players, team())).toEqual({
      ok: false,
      message: 'チーム名が未入力の選手がいます。選手情報を見直してください。',
    });
  });

  it('U-PR-10 チーム方式：チーム名未入力でも固定選手ならエラーにしない', () => {
    const players = [p('A1', { teamName: 'A' }), p('X', { teamName: '', partyFixed: true, partyNumber: 5 })];
    expect(generatePairings(players, team()).ok).toBe(true);
  });

  it('U-PR-11 チーム方式：固定に回った同チーム選手は、チーム人数の判定に含めない', () => {
    const players = Array.from({ length: 7 }, (_, i) =>
      p(`E${i}`, { teamName: '東', ...(i === 0 ? { partyFixed: true, partyNumber: 9 } : {}) }),
    );
    const parties = okParties(generatePairings(players, team(6)));
    expect(parties.map((x) => x.playerIds.length)).toEqual([6, 1]);
  });

  it('U-PR-12 固定選手が同一番号に集中し最大を超えるとエラー（文言一致）', () => {
    const players = [1, 2, 3].map((i) => p(`F${i}`, { partyFixed: true, partyNumber: 3 }));
    expect(generatePairings(players, shuffleC(2))).toEqual({
      ok: false,
      message: 'パーティ番号3の人数がパーティの最大人数を超えています。選手情報のパーティ番号を見直してください。',
    });
  });

  it('U-PR-13 シャッフル（固定なし）：パーティ数は全選手数÷最大人数の切り上げ、人数は平均化', () => {
    const players = Array.from({ length: 13 }, (_, i) => p(`P${i}`));
    const parties = okParties(generatePairings(players, shuffleC(6), seeded(3)));
    expect(parties.map((x) => x.playerIds.length)).toEqual([5, 4, 4]);
    const twelve = okParties(generatePairings(players.slice(0, 12), shuffleC(6), seeded(3)));
    expect(twelve.map((x) => x.playerIds.length)).toEqual([6, 6]);
    expect(parties.map((x) => x.partyNumber)).toEqual([1, 2, 3]);
  });

  it('U-PR-14 シャッフル：全選手が重複・欠落なく割り当てられる', () => {
    const players = Array.from({ length: 20 }, (_, i) => p(`P${i}`));
    const parties = okParties(generatePairings(players, shuffleC(4), seeded(5)));
    const all = parties.flatMap((x) => x.playerIds).sort();
    expect(all).toEqual(players.map((x) => x.id).sort());
    expect(parties.every((x) => x.playerIds.length <= 4)).toBe(true);
  });

  it('U-PR-15 シャッフル：乱数に応じて並びが変わり、同じ乱数列なら再現する', () => {
    const players = Array.from({ length: 12 }, (_, i) => p(`P${i}`));
    const a = okParties(generatePairings(players, shuffleC(4), seeded(7)));
    const b = okParties(generatePairings(players, shuffleC(4), seeded(7)));
    const c = okParties(generatePairings(players, shuffleC(4), seeded(8)));
    expect(a).toEqual(b);
    expect(a.flatMap((x) => x.playerIds)).not.toEqual(c.flatMap((x) => x.playerIds));
  });

  it('U-PR-16 シャッフル：チーム名未入力でもエラーにしない', () => {
    const players = [p('A', { teamName: '赤' }), p('B'), p('C', { teamName: '青' })];
    expect(generatePairings(players, shuffleC(6), seeded(1)).ok).toBe(true);
  });

  it('U-PR-17 全員が固定の場合も生成できる', () => {
    const players = [p('A', { partyFixed: true, partyNumber: 2 }), p('B', { partyFixed: true, partyNumber: 1 })];
    const parties = okParties(generatePairings(players, shuffleC()));
    expect(parties.map((x) => [x.partyNumber, x.playerIds, x.startHole])).toEqual([
      [1, ['B'], 1],
      [2, ['A'], 2],
    ]);
  });

  it('U-PR-18 パーティはパーティ番号順に並び、開始ホールが割り当てられる', () => {
    const players = [
      p('F', { partyFixed: true, partyNumber: 9 }),
      ...Array.from({ length: 16 }, (_, i) => p(`U${i}`)),
    ];
    // 全17名・最大2 → パーティ数9（固定パーティ9＋新規1〜8）。開始ホールは商2
    const parties = okParties(generatePairings(players, shuffleC(2), seeded(2)));
    expect(parties.map((x) => x.partyNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(parties.map((x) => x.startHole)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5]);
  });

  it('U-PR-20 パーティ番号のない「固定」（不整合データ）は非固定として扱い、組合せ表から漏らさない', () => {
    const players = [p('A'), p('B', { partyFixed: true, partyNumber: null })];
    const parties = okParties(generatePairings(players, shuffleC(6), seeded(1)));
    expect(parties.flatMap((x) => x.playerIds).sort()).toEqual(['A', 'B']);
  });

  it('U-PR-19 shuffle は元配列を変更しない', () => {
    const src = [1, 2, 3, 4, 5];
    const copy = [...src];
    shuffle(src, seeded(1));
    expect(src).toEqual(copy);
  });
});

describe('開始ホールの自動割当（要件定義書3.4）', () => {
  const count = (holes: number[]) =>
    holes.reduce<Record<number, number>>((m, h) => ({ ...m, [h]: (m[h] ?? 0) + 1 }), {});

  it('U-SH-01 全24パーティ：開始ホール1〜8に3パーティずつ', () => {
    expect(count(assignStartHoles(24))).toEqual({ 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3 });
  });
  it('U-SH-02 全21パーティ：開始ホール1〜7に3パーティずつ', () => {
    expect(count(assignStartHoles(21))).toEqual({ 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3 });
  });
  it('U-SH-03 全20パーティ：1〜6に3パーティずつ、7のみ2パーティ', () => {
    expect(count(assignStartHoles(20))).toEqual({ 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 2 });
  });
  it('U-SH-04 8パーティ以下は1ホール1パーティ', () => {
    expect(assignStartHoles(8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(assignStartHoles(3)).toEqual([1, 2, 3]);
  });
  it('U-SH-05 9パーティ（商2）', () => {
    expect(assignStartHoles(9)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5]);
  });
  it('U-SH-06 0パーティ・1パーティ', () => {
    expect(assignStartHoles(0)).toEqual([]);
    expect(assignStartHoles(1)).toEqual([1]);
  });
  it('U-SH-07 1〜100パーティで、開始ホールは1〜8・非減少・端数は最後のホールのみ', () => {
    for (let n = 1; n <= 100; n++) {
      const holes = assignStartHoles(n);
      const q = Math.ceil(n / 8);
      expect(holes).toHaveLength(n);
      expect(holes.every((h) => h >= 1 && h <= 8)).toBe(true);
      expect(holes.every((h, i) => i === 0 || h >= holes[i - 1])).toBe(true);
      const c = count(holes);
      const used = Object.keys(c).map(Number).sort((a, b) => a - b);
      expect(used.length).toBe(Math.ceil(n / q));
      used.slice(0, -1).forEach((h) => expect(c[h]).toBe(q));
      expect(c[used[used.length - 1]]).toBeLessThanOrEqual(q);
    }
  });
});

describe('開始グループ（同じ開始ホール内の順番）', () => {
  const g = (list: [number, number][]) =>
    [...assignStartGroups(list.map(([partyNumber, startHole]) => ({ partyNumber, startHole }))).entries()].sort(
      (a, b) => a[0] - b[0],
    );

  it('U-SG-01 同じ開始ホールのパーティにパーティ番号順で1,2,3…を付け、単独のホールは1', () => {
    expect(g([[1, 1], [2, 1], [3, 1], [4, 2]])).toEqual([[1, 1], [2, 2], [3, 3], [4, 1]]);
  });

  it('U-SG-02 入力の並び順に関わらずパーティ番号順で付け、手動変更で重なったホールも対象', () => {
    // パーティ3を開始ホール1へ手動変更した状態（パーティ番号は飛び番あり）
    expect(g([[7, 2], [3, 1], [1, 1], [5, 2]])).toEqual([[1, 1], [3, 2], [5, 1], [7, 2]]);
  });

  it('U-SG-03 パーティなしは空', () => expect(g([])).toEqual([]));
});

describe('開始ホール変更時に選択できない開始ホール（同一開始グループ内の重複禁止）', () => {
  const parties = [
    { partyNumber: 1, startHole: 1 },
    { partyNumber: 2, startHole: 1 },
    { partyNumber: 3, startHole: 2 },
    { partyNumber: 4, startHole: 3 },
    { partyNumber: 5, startHole: 3 },
  ];
  const holes = (n: number) => [...unavailableStartHoles(parties, n).entries()].sort((a, b) => a[0] - b[0]);

  it('U-SG-04 開始グループ1のパーティは、他の開始グループ1が使うホールを選べない（自分のホールは選べる）', () => {
    expect(holes(1)).toEqual([[2, 3], [3, 4]]);
  });

  it('U-SG-05 開始グループ2のパーティは、他の開始グループ2が使うホールだけ選べない', () => {
    expect(holes(2)).toEqual([[3, 5]]);
    expect(holes(5)).toEqual([[1, 2]]);
  });

  it('U-SG-06 存在しないパーティは制限なし', () => expect(holes(99)).toEqual([]));
});
