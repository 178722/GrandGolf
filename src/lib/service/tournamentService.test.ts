import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDb, updateDb } from '@/lib/store/db';
import { AppError } from './errors';
import {
  confirmManualRank,
  createTournament,
  deleteRoundScores,
  deleteTournament,
  generateRanking,
  generateTournamentPairings,
  getTournamentDetail,
  saveCompetition,
  savePlayers,
  saveRoundScores,
  setTournamentStatus,
  updateStartHole,
  updateTournament,
} from './tournamentService';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'gg-svc-'));
  process.env.GRANDGOLF_DATA_DIR = dir;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const COMPETITION = {
  rounds: 2,
  holeInOneConversionEnabled: true,
  holeInOneConversionValue: -2,
  maxPartySize: 6,
  partyAssignmentMethod: 'チーム',
  teamBattleEnabled: true,
  teamRankingMethod: '合計',
};
const PLAYERS = [
  { name: 'Aさん', birthDate: '1971/05/24', teamName: '東', partyFixed: false, partyNumber: null },
  { name: 'Bさん', birthDate: '1985/03/10', teamName: '東', partyFixed: false, partyNumber: null },
  { name: 'Cさん', birthDate: 'S40.01.01', teamName: '西', partyFixed: false, partyNumber: null },
];
const H = (total: number) => [total - 14, 2, 2, 2, 2, 2, 2, 2];

async function expectError(p: Promise<unknown>, code: string, message?: string | RegExp) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe(code);
    if (message) expect((e as AppError).message).toMatch(message);
    return e as AppError;
  }
  throw new Error(`エラー ${code} が発生しませんでした`);
}

async function setup(opts: { pairings?: boolean } = {}) {
  const t = await createTournament({ name: '定例会', date: '2026-11-16', place: 'グラウンド' });
  await saveCompetition(t.id, COMPETITION, false);
  const players = await savePlayers(t.id, PLAYERS, false);
  if (opts.pairings) await generateTournamentPairings(t.id);
  const detail = await getTournamentDetail(t.id);
  return { t, players, detail: detail! };
}
const asInput = (p: { id: string; name: string; birthDate: string; teamName: string; partyFixed: boolean; partyNumber: number | null; absent: boolean }) => ({
  id: p.id,
  name: p.name,
  birthDate: p.birthDate.replace(/-/g, '/'),
  teamName: p.teamName,
  partyFixed: p.partyFixed,
  partyNumber: p.partyNumber,
  absent: p.absent,
});
/** 東チームのパーティ（Aさん・Bさん）のラウンドにスコアを保存する */
async function saveEastRound(tid: string, round: number, a = 30, b = 31) {
  const d = (await getTournamentDetail(tid))!;
  const ids = Object.fromEntries(d.players.map((p) => [p.name, p.id]));
  const party = d.parties.find((p) => p.playerIds.includes(ids['Aさん']))!;
  await saveRoundScores(tid, party.partyNumber, round, { [ids['Aさん']]: H(a), [ids['Bさん']]: H(b) });
  return { party, ids };
}

describe('業務ルール（サービス層）', () => {
  it('U-SV-01 大会登録時のステータスは「進行中」で永続化される', async () => {
    const t = await createTournament({ name: '定例会', date: '2026-11-16', place: 'グラウンド' });
    const db = await loadDb();
    expect(db.tournaments).toEqual([expect.objectContaining({ id: t.id, status: '進行中', name: '定例会' })]);
  });

  it('U-SV-02 入力エラーは保存しない', async () => {
    const e = await expectError(createTournament({ name: '', date: '2026-11-16', place: 'x' }), 'VALIDATION_ERROR');
    expect((e.details as Record<string, string>).name).toBeDefined();
    expect((await loadDb()).tournaments).toHaveLength(0);
  });

  it('U-SV-03 大会削除で関連データが連鎖削除され、他大会は影響を受けない', async () => {
    const a = await setup({ pairings: true });
    await saveEastRound(a.t.id, 1);
    await generateRanking(a.t.id);
    const b = await setup({ pairings: true });
    await deleteTournament(a.t.id);
    const db = await loadDb();
    for (const key of ['competitions', 'players', 'parties', 'scores', 'rankings'] as const) {
      expect((db[key] as { tournamentId: string }[]).some((x) => x.tournamentId === a.t.id)).toBe(false);
    }
    expect(db.tournaments.map((t) => t.id)).toEqual([b.t.id]);
    expect(db.players.filter((p) => p.tournamentId === b.t.id)).toHaveLength(3);
    expect(db.parties.filter((p) => p.tournamentId === b.t.id).length).toBeGreaterThan(0);
  });

  it('U-SV-04 「終了」の間は編集・生成・スコア入力・順位表作成・手動確定がすべて拒否される', async () => {
    const { t, detail } = await setup({ pairings: true });
    const before = await generateRanking(t.id);
    await setTournamentStatus(t.id, '終了');
    const party = detail.parties[0];
    const scores = Object.fromEntries(party.playerIds.map((id) => [id, H(30)]));
    await expectError(updateTournament(t.id, { name: 'x', date: '2026-11-16', place: 'y' }), 'TOURNAMENT_FINISHED');
    await expectError(saveCompetition(t.id, COMPETITION, true), 'TOURNAMENT_FINISHED');
    await expectError(savePlayers(t.id, detail.players.map(asInput), true), 'TOURNAMENT_FINISHED');
    await expectError(generateTournamentPairings(t.id), 'TOURNAMENT_FINISHED');
    await expectError(updateStartHole(t.id, party.partyNumber, 3), 'TOURNAMENT_FINISHED');
    await expectError(saveRoundScores(t.id, party.partyNumber, 1, scores), 'TOURNAMENT_FINISHED');
    await expectError(deleteRoundScores(t.id, party.partyNumber, 1), 'TOURNAMENT_FINISHED');
    await expectError(generateRanking(t.id), 'TOURNAMENT_FINISHED', /大会が終了しているため変更できません/);
    await expectError(
      confirmManualRank(t.id, { kind: 'individual', playerId: detail.players[0].id }, 1),
      'TOURNAMENT_FINISHED',
    );
    const d = (await getTournamentDetail(t.id))!;
    expect(d.tournament.name).toBe('定例会');
    // 順位表は終了前に作成したものがそのまま残る
    expect(d.ranking).toEqual(before);
  });

  it('U-SV-04b 「終了」の間も大会削除は実行できる、再開すれば順位表作成も可能に戻る', async () => {
    const { t } = await setup({ pairings: true });
    await setTournamentStatus(t.id, '終了');
    await setTournamentStatus(t.id, '進行中');
    await expect(generateRanking(t.id)).resolves.toBeDefined();
    await setTournamentStatus(t.id, '終了');
    await deleteTournament(t.id);
    expect((await loadDb()).tournaments).toHaveLength(0);
  });

  it('U-SV-05 再開で編集可能に戻る、不正なステータスはエラー', async () => {
    const { t } = await setup();
    await setTournamentStatus(t.id, '終了');
    await setTournamentStatus(t.id, '進行中');
    const updated = await updateTournament(t.id, { name: '秋季大会', date: '2026-10-01', place: '第二公園' });
    expect(updated).toMatchObject({ name: '秋季大会', date: '2026-10-01', place: '第二公園', status: '進行中' });
    await expectError(setTournamentStatus(t.id, '中止'), 'VALIDATION_ERROR');
  });

  it('U-SV-06 組合せ表生成済み・試合結果なしで競技情報を変更する場合は確認が必要、確認ありで組合せ表・スコア表・順位表を削除', async () => {
    const { t } = await setup({ pairings: true });
    await generateRanking(t.id);
    const changed = { ...COMPETITION, rounds: 3 };
    await expectError(saveCompetition(t.id, changed, false), 'CONFIRM_REQUIRED', /再生成が必要/);
    expect((await getTournamentDetail(t.id))!.competition!.rounds).toBe(2);
    await saveCompetition(t.id, changed, true);
    const d = (await getTournamentDetail(t.id))!;
    expect(d.competition!.rounds).toBe(3);
    expect(d.parties).toHaveLength(0);
    expect(d.ranking).toBeNull();
  });

  it('U-SV-07 内容に変更がない保存は確認不要で組合せ表を保持する', async () => {
    const { t } = await setup({ pairings: true });
    await saveCompetition(t.id, COMPETITION, false);
    expect((await getTournamentDetail(t.id))!.parties.length).toBeGreaterThan(0);
  });

  it('U-SV-08 試合結果が1件でもあれば競技情報の全項目の変更をブロック', async () => {
    const { t } = await setup({ pairings: true });
    await saveEastRound(t.id, 1);
    for (const patch of [
      { rounds: 3 },
      { holeInOneConversionEnabled: false },
      { holeInOneConversionValue: -3 },
      { maxPartySize: 5 },
      { partyAssignmentMethod: 'シャッフル' },
      { teamBattleEnabled: false },
      { teamRankingMethod: '平均' },
    ]) {
      await expectError(saveCompetition(t.id, { ...COMPETITION, ...patch }, true), 'RESULTS_EXIST');
    }
  });

  it('U-SV-09 組合せ表生成済み・試合結果なしで選手を追加・削除・チーム名等・選手名・生年月日を変更する場合は確認が必要', async () => {
    const { t, players } = await setup({ pairings: true });
    const base = players.map(asInput);
    const added = [...base, { name: 'Dさん', birthDate: '1990/01/01', teamName: '西', partyFixed: false, partyNumber: null }];
    await expectError(savePlayers(t.id, added, false), 'CONFIRM_REQUIRED');
    await expectError(savePlayers(t.id, base.slice(1), false), 'CONFIRM_REQUIRED');
    await expectError(savePlayers(t.id, base.map((p, i) => (i === 0 ? { ...p, teamName: '西' } : p)), false), 'CONFIRM_REQUIRED');
    await expectError(savePlayers(t.id, base.map((p, i) => (i === 0 ? { ...p, partyFixed: true, partyNumber: 5 } : p)), false), 'CONFIRM_REQUIRED');
    await expectError(savePlayers(t.id, base.map((p, i) => (i === 0 ? { ...p, absent: true } : p)), false), 'CONFIRM_REQUIRED');
    await expectError(savePlayers(t.id, base.map((p, i) => (i === 0 ? { ...p, name: 'Aさん改' } : p)), false), 'CONFIRM_REQUIRED');
    await expectError(savePlayers(t.id, base.map((p, i) => (i === 0 ? { ...p, birthDate: 'S46.05.25' } : p)), false), 'CONFIRM_REQUIRED', /再生成が必要/);
    expect((await getTournamentDetail(t.id))!.parties.length).toBeGreaterThan(0);
    await savePlayers(t.id, added, true);
    const d = (await getTournamentDetail(t.id))!;
    expect(d.players).toHaveLength(4);
    expect(d.parties).toHaveLength(0);
  });

  it('U-SV-10 組合せ表生成済み・試合結果なしでは選手名・生年月日のみの変更も確認が必要、確認ありで組合せ表・スコア表・順位表を削除', async () => {
    const { t, players } = await setup({ pairings: true });
    await generateRanking(t.id);
    const edited = players.map(asInput).map((p, i) => (i === 0 ? { ...p, name: 'Aさん改', birthDate: 'S46.05.25' } : p));
    await expectError(savePlayers(t.id, edited, false), 'CONFIRM_REQUIRED');
    expect((await getTournamentDetail(t.id))!.players[0].name).toBe('Aさん');
    await savePlayers(t.id, edited, true);
    const d = (await getTournamentDetail(t.id))!;
    expect(d.players[0]).toMatchObject({ name: 'Aさん改', birthDate: '1971-05-25' });
    expect(d.parties).toHaveLength(0);
    expect(d.ranking).toBeNull();
  });

  it('U-SV-10b 内容に変更がない選手一覧の保存は確認不要で組合せ表を保持する', async () => {
    const { t, players } = await setup({ pairings: true });
    await savePlayers(t.id, players.map(asInput), false);
    expect((await getTournamentDetail(t.id))!.parties.length).toBeGreaterThan(0);
  });

  it('U-SV-11 試合結果がある選手の削除はブロック', async () => {
    const { t, players } = await setup({ pairings: true });
    await saveEastRound(t.id, 1);
    const withoutA = players.map(asInput).filter((p) => p.name !== 'Aさん');
    await expectError(savePlayers(t.id, withoutA, true), 'RESULTS_EXIST', /Aさん/);
  });

  it('U-SV-12 試合結果が1件でもあれば、全選手のパーティ固定・番号・チーム名・不参加の変更をブロック（名前・生年月日は可）', async () => {
    const { t, players } = await setup({ pairings: true });
    await saveEastRound(t.id, 1);
    const base = players.map(asInput);
    const cIndex = base.findIndex((p) => p.name === 'Cさん'); // 結果のない選手
    await expectError(savePlayers(t.id, base.map((p, i) => (i === cIndex ? { ...p, teamName: '東' } : p)), true), 'RESULTS_EXIST');
    await expectError(savePlayers(t.id, base.map((p, i) => (i === cIndex ? { ...p, partyFixed: true, partyNumber: 9 } : p)), true), 'RESULTS_EXIST');
    await expectError(savePlayers(t.id, base.map((p, i) => (i === cIndex ? { ...p, absent: true } : p)), true), 'RESULTS_EXIST');
    const renamed = base.map((p, i) => (i === cIndex ? { ...p, name: 'Cさん改', birthDate: '1965/01/02' } : p));
    const before = (await getTournamentDetail(t.id))!;
    await savePlayers(t.id, renamed, false);
    const d = (await getTournamentDetail(t.id))!;
    expect(d.players.find((p) => p.id === base[cIndex].id)!.name).toBe('Cさん改');
    // 試合結果がある場合の選手名・生年月日の訂正は、組合せ表・スコア表・試合結果を削除しない
    expect(d.parties).toEqual(before.parties);
    expect(d.scores).toEqual(before.scores);
  });

  it('U-SV-13 試合結果がある状態で結果の無い選手は削除でき、組合せ表から外れる（空になったパーティは消える）', async () => {
    const { t, players } = await setup({ pairings: true });
    await saveEastRound(t.id, 1);
    const c = players.find((p) => p.name === 'Cさん')!;
    await savePlayers(t.id, players.map(asInput).filter((p) => p.id !== c.id), false);
    const d = (await getTournamentDetail(t.id))!;
    expect(d.players.map((p) => p.name)).toEqual(['Aさん', 'Bさん']);
    expect(d.parties.flatMap((p) => p.playerIds)).not.toContain(c.id);
    expect(d.parties).toHaveLength(1);
  });

  it('U-SV-13b 試合結果がある状態でも選手の追加はでき、組合せ表は変わらず、順位表では集計対象外となる', async () => {
    const { t, players } = await setup({ pairings: true });
    await saveEastRound(t.id, 1);
    const before = (await getTournamentDetail(t.id))!.parties;
    await savePlayers(t.id, [...players.map(asInput), { name: 'Dさん', birthDate: '1990/01/01', teamName: '西', partyFixed: false, partyNumber: null }], false);
    const d = (await getTournamentDetail(t.id))!;
    expect(d.players).toHaveLength(4);
    expect(d.parties).toEqual(before);
    expect((await generateRanking(t.id)).excludedPlayerNames).toContain('Dさん');
  });

  it('U-SV-13c 不参加の選手は保存され、組合せ表の生成対象から除外される', async () => {
    const { t, players } = await setup();
    const c = players.find((p) => p.name === 'Cさん')!;
    await savePlayers(t.id, players.map(asInput).map((p) => (p.id === c.id ? { ...p, absent: true } : p)), false);
    await generateTournamentPairings(t.id);
    const d = (await getTournamentDetail(t.id))!;
    expect(d.players.find((p) => p.id === c.id)!.absent).toBe(true);
    expect(d.parties.flatMap((p) => p.playerIds)).not.toContain(c.id);
    expect(d.parties.flatMap((p) => p.playerIds)).toHaveLength(2);
  });

  it('U-SV-14 選手名重複はVALIDATION_ERROR、新規選手は登録順の末尾に追加', async () => {
    const { t, players } = await setup();
    const e = await expectError(savePlayers(t.id, [...players.map(asInput), { ...PLAYERS[0] }], false), 'VALIDATION_ERROR');
    expect(e.details).toEqual({ 3: { name: '選手名「Aさん」は既に登録されています' } });
    const saved = await savePlayers(t.id, [{ ...PLAYERS[0], name: 'Zさん' }, ...players.map(asInput)], false);
    expect(saved.map((p) => p.name)).toEqual(['Aさん', 'Bさん', 'Cさん', 'Zさん']);
  });

  it('U-SV-15 試合結果がある場合は組合せ表の再生成をエラーとする（文言一致）', async () => {
    const { t } = await setup({ pairings: true });
    await saveEastRound(t.id, 1);
    await expectError(generateTournamentPairings(t.id), 'RESULTS_EXIST', '試合結果が入力されています。試合結果を削除して下さい。');
  });

  it('U-SV-16 再生成で既存の組合せ表が置き換わる（重複しない）', async () => {
    const { t } = await setup({ pairings: true });
    await generateTournamentPairings(t.id);
    const d = (await getTournamentDetail(t.id))!;
    expect(d.parties.map((p) => p.partyNumber)).toEqual([1, 2]);
    expect(d.parties.flatMap((p) => p.playerIds)).toHaveLength(3);
  });

  it('U-SV-16b 生成エラー（参加2名未満など）は PAIRING_ERROR で既存の組合せ表を変更しない', async () => {
    const t = await createTournament({ name: 'x', date: '2026-11-16', place: 'y' });
    await expectError(generateTournamentPairings(t.id), 'PAIRING_ERROR', /競技情報/);
    await saveCompetition(t.id, COMPETITION, false);
    await savePlayers(t.id, [PLAYERS[0]], false);
    await expectError(generateTournamentPairings(t.id), 'PAIRING_ERROR', /2名未満/);

    // 生成済みの組合せ表がある状態で生成エラーになっても、既存の組合せ表は残る
    const { t: t2 } = await setup({ pairings: true });
    const before = (await getTournamentDetail(t2.id))!.parties;
    // 競技情報の変更は組合せ表を削除するため、ストアを直接書き換えてチーム人数超過の状態にする
    await updateDb((db) => {
      db.competitions.find((c) => c.tournamentId === t2.id)!.maxPartySize = 1;
    });
    await expectError(generateTournamentPairings(t2.id), 'PAIRING_ERROR', /チーム『東』/);
    expect((await getTournamentDetail(t2.id))!.parties).toEqual(before);
  });

  it('U-SV-17 開始ホールは1〜8で手動変更でき、同じ開始グループの他パーティが使うホール・範囲外・存在しないパーティはエラー', async () => {
    const { t, detail } = await setup({ pairings: true });
    const [p1, p2] = detail.parties; // 開始ホール1・2（どちらも開始グループ1）
    await updateStartHole(t.id, p1.partyNumber, 3);
    expect((await getTournamentDetail(t.id))!.parties.map((p) => p.startHole)).toEqual([3, 2]);
    await expectError(
      updateStartHole(t.id, p2.partyNumber, 3),
      'VALIDATION_ERROR',
      `開始ホール3は、同じ開始グループのパーティ${p1.partyNumber}に割り当て済みのため選択できません`,
    );
    await updateStartHole(t.id, p1.partyNumber, 3); // 自分の現在のホールは選択可
    await expectError(updateStartHole(t.id, p1.partyNumber, 0), 'VALIDATION_ERROR');
    await expectError(updateStartHole(t.id, p1.partyNumber, 9), 'VALIDATION_ERROR');
    await expectError(updateStartHole(t.id, 99, 1), 'NOT_FOUND');
  });

  it('U-SV-17b 別の開始グループのパーティが使う開始ホールは選択でき、複数パーティが同じ開始ホールになることを許容する', async () => {
    const t = await createTournament({ name: 'x', date: '2026-11-16', place: 'y' });
    await saveCompetition(
      t.id,
      { ...COMPETITION, maxPartySize: 1, partyAssignmentMethod: 'シャッフル', teamBattleEnabled: false },
      false,
    );
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...PLAYERS[0], name: `選手${i + 1}` }));
    await savePlayers(t.id, nine, false);
    await generateTournamentPairings(t.id);
    // 9パーティ：開始ホール 1,1,2,2,3,3,4,4,5（開始グループ 1,2,1,2,1,2,1,2,1）
    const holesOf = async () => (await getTournamentDetail(t.id))!.parties.map((p) => p.startHole);
    expect(await holesOf()).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5]);
    // パーティ2（開始グループ2）は、開始グループ2のパーティ4が使う開始ホール2を選べない
    await expectError(updateStartHole(t.id, 2, 2), 'VALIDATION_ERROR', /パーティ4に割り当て済み/);
    // 開始ホール5は開始グループ1のパーティ9のみが使用しているため選択でき、同じ開始ホールを共用する
    await updateStartHole(t.id, 2, 5);
    expect(await holesOf()).toEqual([1, 5, 2, 2, 3, 3, 4, 4, 5]);
  });

  it('U-SV-18 スコアはパーティ全員分・8ホール・1〜99のみ、ラウンドは1〜ラウンド数', async () => {
    const { t, detail } = await setup({ pairings: true });
    const party = detail.parties.find((p) => p.playerIds.length === 2)!;
    const [a, b] = party.playerIds;
    await expectError(saveRoundScores(t.id, party.partyNumber, 1, { [a]: H(30) }), 'VALIDATION_ERROR');
    await expectError(saveRoundScores(t.id, party.partyNumber, 1, { [a]: H(30), [b]: [0, 2, 2, 2, 2, 2, 2, 2] }), 'VALIDATION_ERROR');
    await expectError(saveRoundScores(t.id, party.partyNumber, 1, { [a]: H(30), [b]: [2, 2, 2] }), 'VALIDATION_ERROR');
    await expectError(saveRoundScores(t.id, party.partyNumber, 3, { [a]: H(30), [b]: H(30) }), 'VALIDATION_ERROR');
    await expectError(saveRoundScores(t.id, party.partyNumber, 0, { [a]: H(30), [b]: H(30) }), 'VALIDATION_ERROR');
    await expectError(
      saveRoundScores(t.id, party.partyNumber, 1, { [a]: H(30), [b]: H(30), other: H(30) }),
      'VALIDATION_ERROR',
    );
    expect((await getTournamentDetail(t.id))!.scores).toHaveLength(0);
  });

  it('U-SV-19 登録済みスコアを修正（上書き）でき、他ラウンドに影響しない', async () => {
    const { t } = await setup({ pairings: true });
    await saveEastRound(t.id, 1, 30, 31);
    await saveEastRound(t.id, 2, 40, 41);
    const { ids } = await saveEastRound(t.id, 1, 20, 21);
    const scores = (await getTournamentDetail(t.id))!.scores;
    expect(scores).toHaveLength(4);
    expect(scores.find((s) => s.playerId === ids['Aさん'] && s.round === 1)!.holes).toEqual(H(20));
    expect(scores.find((s) => s.playerId === ids['Aさん'] && s.round === 2)!.holes).toEqual(H(40));
  });

  it('U-SV-20 スコア削除で未入力に戻り、組合せ表の再生成が可能になる', async () => {
    const { t } = await setup({ pairings: true });
    const { party } = await saveEastRound(t.id, 1);
    await deleteRoundScores(t.id, party.partyNumber, 1);
    expect((await getTournamentDetail(t.id))!.hasResults).toBe(false);
    await expect(generateTournamentPairings(t.id)).resolves.toHaveLength(2);
  });

  it('U-SV-21 スコアを修正しても順位表は自動では変わらず、再作成で反映される', async () => {
    const { t } = await setup({ pairings: true });
    await saveEastRound(t.id, 1, 30, 31);
    await saveEastRound(t.id, 2, 30, 31);
    const first = await generateRanking(t.id);
    expect(first.individual.map((r) => r.playerName)).toEqual(['Aさん', 'Bさん']);
    expect(first.excludedPlayerNames).toEqual(['Cさん']);
    await saveEastRound(t.id, 2, 40, 20);
    expect((await getTournamentDetail(t.id))!.ranking!.individual.map((r) => r.playerName)).toEqual(['Aさん', 'Bさん']);
    const second = await generateRanking(t.id);
    expect(second.individual.map((r) => [r.playerName, r.totalScore])).toEqual([
      ['Bさん', 51],
      ['Aさん', 70],
    ]);
    expect(second.team!.map((r) => [r.teamName, r.totalScore])).toEqual([['東', 121]]);
  });

  it('U-SV-22 手動確定は順位表へ直接反映され、再作成で引き継がれない', async () => {
    const t = await createTournament({ name: 'x', date: '2026-11-16', place: 'y' });
    await saveCompetition(t.id, { ...COMPETITION, rounds: 1, teamBattleEnabled: false }, false);
    const players = await savePlayers(
      t.id,
      [
        { ...PLAYERS[0], birthDate: '1970/01/01' },
        { ...PLAYERS[1], birthDate: '1970/01/01' },
      ],
      false,
    );
    const [party] = await generateTournamentPairings(t.id);
    await saveRoundScores(t.id, party.partyNumber, 1, { [players[0].id]: H(30), [players[1].id]: H(30) });
    const snap = await generateRanking(t.id);
    expect(snap.individual.every((r) => r.jankenPending)).toBe(true);
    await confirmManualRank(t.id, { kind: 'individual', playerId: players[1].id }, 1);
    const confirmed = (await getTournamentDetail(t.id))!.ranking!;
    expect(confirmed.individual.map((r) => [r.playerName, r.rank, r.jankenPending])).toEqual([
      ['Bさん', 1, false],
      ['Aさん', 1, true],
    ]);
    await expectError(confirmManualRank(t.id, { kind: 'individual', playerId: players[0].id }, 1), 'VALIDATION_ERROR');
    await expectError(confirmManualRank(t.id, { kind: 'x' }, 1), 'VALIDATION_ERROR');
    const regenerated = await generateRanking(t.id);
    expect(regenerated.individual.every((r) => r.jankenPending && r.rank === 1)).toBe(true);
  });

  it('U-SV-23 競技情報が未登録の場合、順位表作成はエラー', async () => {
    const t = await createTournament({ name: 'x', date: '2026-11-16', place: 'y' });
    await expectError(generateRanking(t.id), 'VALIDATION_ERROR');
    await expectError(confirmManualRank(t.id, { kind: 'individual', playerId: 'a' }, 1), 'NOT_FOUND');
  });

  it('U-SV-24 存在しない大会はNOT_FOUND', async () => {
    await expectError(updateTournament('none', { name: 'x', date: '2026-11-16', place: 'y' }), 'NOT_FOUND');
    await expectError(deleteTournament('none'), 'NOT_FOUND');
    await expectError(saveCompetition('none', COMPETITION, false), 'NOT_FOUND');
    await expectError(savePlayers('none', [], false), 'NOT_FOUND');
    await expectError(generateTournamentPairings('none'), 'NOT_FOUND');
    await expectError(generateRanking('none'), 'NOT_FOUND');
    expect(await getTournamentDetail('none')).toBeNull();
  });

  it('U-SV-25 競技情報は1大会につき1件', async () => {
    const { t } = await setup();
    await saveCompetition(t.id, { ...COMPETITION, rounds: 4 }, false);
    const db = await loadDb();
    expect(db.competitions.filter((c) => c.tournamentId === t.id)).toEqual([expect.objectContaining({ rounds: 4 })]);
  });

  it('U-SV-26 選手名の重複は同一大会内のみ不可で、別大会では同名を登録できる', async () => {
    await setup();
    const t2 = await createTournament({ name: '別大会', date: '2026-11-20', place: 'z' });
    await expect(savePlayers(t2.id, [PLAYERS[0]], false)).resolves.toHaveLength(1);
  });
});
