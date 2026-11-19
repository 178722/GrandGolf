import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPETITION_FORM,
  isTeamNameRequired,
  validateCompetitionInput,
  validatePlayerInput,
  validatePlayerList,
  validateTournamentInput,
} from './validation';

const Z = (n: number) => '全'.repeat(n);

describe('大会情報の入力バリデーション（要件定義書3.1）', () => {
  const base = { name: '定例会', date: '2026-11-16', place: 'グラウンド' };
  const errorsOf = (raw: unknown) => {
    const r = validateTournamentInput(raw);
    return r.ok ? {} : r.errors;
  };

  it('U-TI-01 正常な入力を受け付ける', () => {
    expect(validateTournamentInput(base)).toEqual({ ok: true, value: base });
  });
  it('U-TI-02 大会名が空はエラー', () => expect(errorsOf({ ...base, name: '' }).name).toBeDefined());
  it('U-TI-03 大会名が空白のみはエラー', () => expect(errorsOf({ ...base, name: '　 ' }).name).toBeDefined());
  it('U-TI-04 大会名は全角50文字まで可', () => expect(validateTournamentInput({ ...base, name: Z(50) }).ok).toBe(true));
  it('U-TI-05 大会名51文字はエラー（自動切り詰めしない）', () => {
    expect(errorsOf({ ...base, name: Z(51) }).name).toMatch(/50文字以内/);
  });
  it('U-TI-06 開催場所は全角50文字まで可、51文字はエラー', () => {
    expect(validateTournamentInput({ ...base, place: Z(50) }).ok).toBe(true);
    expect(errorsOf({ ...base, place: Z(51) }).place).toMatch(/50文字以内/);
  });
  it('U-TI-07 開催場所が空はエラー', () => expect(errorsOf({ ...base, place: '' }).place).toBeDefined());
  it('U-TI-08 開催日が空はエラー', () => expect(errorsOf({ ...base, date: '' }).date).toBeDefined());
  it('U-TI-09 開催日が不正形式・実在しない日はエラー', () => {
    expect(errorsOf({ ...base, date: '2026/11/16' }).date).toBeDefined();
    expect(errorsOf({ ...base, date: '2026-02-30' }).date).toBeDefined();
  });
  it('U-TI-10 前後の空白は除去して保存する', () => {
    const r = validateTournamentInput({ ...base, name: ' 定例会 ' });
    expect(r.ok && r.value.name).toBe('定例会');
  });
  it('U-TI-11 入力自体が無い場合は全項目エラー', () => {
    expect(Object.keys(errorsOf(null)).sort()).toEqual(['date', 'name', 'place']);
  });
});

describe('競技情報の入力バリデーション（要件定義書3.2）', () => {
  const base = {
    rounds: 2,
    holeInOneConversionEnabled: true,
    holeInOneConversionValue: -2,
    maxPartySize: 6,
    partyAssignmentMethod: 'チーム',
    teamBattleEnabled: true,
    teamRankingMethod: '平均',
  };
  const errorsOf = (patch: Record<string, unknown>) => {
    const r = validateCompetitionInput({ ...base, ...patch });
    return r.ok ? {} : r.errors;
  };

  it('U-CP-01 画面の初期値が要件どおり', () => {
    expect(DEFAULT_COMPETITION_FORM).toMatchObject({
      rounds: 1,
      holeInOneConversionEnabled: true,
      holeInOneConversionValue: -2,
      maxPartySize: 6,
      teamBattleEnabled: false,
    });
  });
  it('U-CP-02 ラウンド数は1〜5', () => {
    expect(errorsOf({ rounds: 1 }).rounds).toBeUndefined();
    expect(errorsOf({ rounds: 5 }).rounds).toBeUndefined();
    expect(errorsOf({ rounds: 0 }).rounds).toBeDefined();
    expect(errorsOf({ rounds: 6 }).rounds).toBeDefined();
    expect(errorsOf({ rounds: 1.5 }).rounds).toBeDefined();
  });
  it('U-CP-03 変換ありの場合、変換値は-5〜1', () => {
    expect(errorsOf({ holeInOneConversionValue: -5 }).holeInOneConversionValue).toBeUndefined();
    expect(errorsOf({ holeInOneConversionValue: 1 }).holeInOneConversionValue).toBeUndefined();
    expect(errorsOf({ holeInOneConversionValue: -6 }).holeInOneConversionValue).toBeDefined();
    expect(errorsOf({ holeInOneConversionValue: 2 }).holeInOneConversionValue).toBeDefined();
    expect(errorsOf({ holeInOneConversionValue: null }).holeInOneConversionValue).toBeDefined();
  });
  it('U-CP-04 変換なしの場合、変換値は検証せずnullとして保存する', () => {
    const r = validateCompetitionInput({ ...base, holeInOneConversionEnabled: false, holeInOneConversionValue: 99 });
    expect(r.ok && r.value.holeInOneConversionValue).toBeNull();
  });
  it('U-CP-05 パーティの最大人数は1〜6', () => {
    expect(errorsOf({ maxPartySize: 1 }).maxPartySize).toBeUndefined();
    expect(errorsOf({ maxPartySize: 6 }).maxPartySize).toBeUndefined();
    expect(errorsOf({ maxPartySize: 0 }).maxPartySize).toBeDefined();
    expect(errorsOf({ maxPartySize: 7 }).maxPartySize).toBeDefined();
  });
  it('U-CP-06 パーティの決定方法は必須', () => {
    expect(errorsOf({ partyAssignmentMethod: null }).partyAssignmentMethod).toBeDefined();
    expect(errorsOf({ partyAssignmentMethod: 'ランダム' }).partyAssignmentMethod).toBeDefined();
    expect(errorsOf({ partyAssignmentMethod: 'シャッフル' }).partyAssignmentMethod).toBeUndefined();
  });
  it('U-CP-07 チーム戦ありの場合、順位決定方法は必須', () => {
    expect(errorsOf({ teamRankingMethod: null }).teamRankingMethod).toBeDefined();
    expect(errorsOf({ teamRankingMethod: '合計' }).teamRankingMethod).toBeUndefined();
  });
  it('U-CP-08 チーム戦なしの場合、順位決定方法はnullとして保存する', () => {
    const r = validateCompetitionInput({ ...base, teamBattleEnabled: false, teamRankingMethod: '平均' });
    expect(r.ok && r.value.teamRankingMethod).toBeNull();
  });
  it('U-CP-09 チェックボックス項目が真偽値でない場合はエラー', () => {
    expect(errorsOf({ holeInOneConversionEnabled: 'true' }).holeInOneConversionEnabled).toBeDefined();
    expect(errorsOf({ teamBattleEnabled: 'true' }).teamBattleEnabled).toBeDefined();
  });
});

describe('選手情報の入力バリデーション（要件定義書3.3）', () => {
  const teamCompetition = { teamBattleEnabled: true, partyAssignmentMethod: 'シャッフル' as const };
  const shuffleNoTeam = { teamBattleEnabled: false, partyAssignmentMethod: 'シャッフル' as const };
  const base = { name: 'Aさん', birthDate: 'S46.05.24', teamName: 'スタッフ', partyFixed: true, partyNumber: 1 };
  const errorsOf = (patch: Record<string, unknown>, comp: Parameters<typeof validatePlayerInput>[1] = shuffleNoTeam) => {
    const r = validatePlayerInput({ ...base, ...patch }, comp);
    return r.ok ? {} : r.errors;
  };

  it('U-PL-01 正常な入力を受け付け、生年月日を西暦に正規化する', () => {
    const r = validatePlayerInput(base, teamCompetition);
    expect(r).toEqual({
      ok: true,
      value: { name: 'Aさん', birthDate: '1971-05-24', teamName: 'スタッフ', partyFixed: true, partyNumber: 1, absent: false },
    });
    const absent = validatePlayerInput({ ...base, absent: true }, teamCompetition);
    expect(absent.ok && absent.value.absent).toBe(true);
  });
  it('U-PL-02 選手名が空はエラー', () => expect(errorsOf({ name: '' }).name).toBeDefined());
  it('U-PL-03 選手名は全角10文字まで、11文字はエラー', () => {
    expect(errorsOf({ name: Z(10) }).name).toBeUndefined();
    expect(errorsOf({ name: Z(11) }).name).toMatch(/10文字以内/);
  });
  it('U-PL-04 チーム名は全角10文字まで、11文字はエラー', () => {
    expect(errorsOf({ teamName: Z(10) }).teamName).toBeUndefined();
    expect(errorsOf({ teamName: Z(11) }).teamName).toMatch(/10文字以内/);
  });
  it('U-PL-05 チーム戦ありの場合、チーム名は必須', () => {
    expect(errorsOf({ teamName: '' }, teamCompetition).teamName).toBeDefined();
  });
  it('U-PL-06 パーティの決定方法がチームの場合、チーム名は必須', () => {
    expect(errorsOf({ teamName: '' }, { teamBattleEnabled: false, partyAssignmentMethod: 'チーム' }).teamName).toBeDefined();
  });
  it('U-PL-07 チーム戦なし・シャッフルの場合、チーム名は任意', () => {
    expect(errorsOf({ teamName: '' }, shuffleNoTeam).teamName).toBeUndefined();
  });
  it('U-PL-08 競技情報が未登録の場合、チーム名は任意', () => {
    expect(errorsOf({ teamName: '' }, null).teamName).toBeUndefined();
  });
  it('U-PL-09 パーティ固定の場合、パーティ番号は1〜99', () => {
    expect(errorsOf({ partyNumber: 1 }).partyNumber).toBeUndefined();
    expect(errorsOf({ partyNumber: 99 }).partyNumber).toBeUndefined();
    expect(errorsOf({ partyNumber: 0 }).partyNumber).toBeDefined();
    expect(errorsOf({ partyNumber: 100 }).partyNumber).toBeDefined();
    expect(errorsOf({ partyNumber: null }).partyNumber).toBeDefined();
  });
  it('U-PL-10 非固定の場合、パーティ番号はnullとして保存する', () => {
    const r = validatePlayerInput({ ...base, partyFixed: false, partyNumber: 5 }, shuffleNoTeam);
    expect(r.ok && r.value.partyNumber).toBeNull();
  });
  it('U-PL-11 生年月日が空・不正形式はエラー', () => {
    expect(errorsOf({ birthDate: '' }).birthDate).toBeDefined();
    expect(errorsOf({ birthDate: '1971-05-24' }).birthDate).toBeDefined();
  });

  const row = (name: string, birthDate = '1971/05/24') => ({ name, birthDate, teamName: '', partyFixed: false, partyNumber: null });
  it('U-PL-12 同一大会内の選手名重複はエラー（後の行にエラー）', () => {
    const r = validatePlayerList([row('Aさん'), row('Bさん'), row('Aさん')], null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors)).toEqual(['2']);
      expect(r.errors[2].name).toMatch(/既に登録/);
    }
  });
  it('U-PL-13 前後空白の違いだけの同名も重複とみなす', () => {
    const r = validatePlayerList([row('Aさん'), row(' Aさん ')], null);
    expect(!r.ok && Object.keys(r.errors)).toEqual(['1']);
  });
  it('U-PL-16 全角・半角の違う選手名は別名として扱う（重複にしない）', () => {
    expect(validatePlayerList([row('Ａさん'), row('Aさん')], null).ok).toBe(true);
  });
  it('U-PL-14 複数行のエラーを行インデックスごとに返す', () => {
    const r = validatePlayerList([row(''), row('Bさん'), row('Cさん', 'xxx')], null);
    expect(!r.ok && Object.keys(r.errors)).toEqual(['0', '2']);
  });
  it('U-PL-15 チーム名必須条件の判定', () => {
    expect(isTeamNameRequired({ teamBattleEnabled: true, partyAssignmentMethod: 'シャッフル' })).toBe(true);
    expect(isTeamNameRequired({ teamBattleEnabled: false, partyAssignmentMethod: 'チーム' })).toBe(true);
    expect(isTeamNameRequired({ teamBattleEnabled: false, partyAssignmentMethod: 'シャッフル' })).toBe(false);
    expect(isTeamNameRequired(null)).toBe(false);
  });
});
