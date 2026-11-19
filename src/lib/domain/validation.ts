// 入力バリデーション（要件定義書3.1〜3.3）。フロントエンドのフォームとAPIルートの両方で同じ関数を使用する。
// 上限超過は自動で切り詰めずエラーとする（要件定義書3章冒頭）。

import type {
  Competition,
  PartyAssignmentMethod,
  TeamRankingMethod,
} from '@/types/tournament';
import { parseBirthDate } from './birthDate';
import { isValidIsoDate } from './dates';
import { charLength } from './text';

export type FieldErrors = Record<string, string>;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export const LIMITS = {
  tournamentName: 50,
  place: 50,
  playerName: 10,
  teamName: 10,
  rounds: { min: 1, max: 5 },
  holeInOneValue: { min: -5, max: 1 },
  maxPartySize: { min: 1, max: 6 },
  partyNumber: { min: 1, max: 99 },
  strokes: { min: 1, max: 99 },
  startHole: { min: 1, max: 8 },
} as const;

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// ---------- 大会情報（3.1） ----------

export type TournamentInput = { name: string; date: string; place: string };

export function validateTournamentInput(raw: unknown): ValidationResult<TournamentInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = str(r.name);
  const date = str(r.date);
  const place = str(r.place);
  const errors: FieldErrors = {};

  if (!name) errors.name = '大会名を入力してください';
  else if (charLength(name) > LIMITS.tournamentName)
    errors.name = `大会名は${LIMITS.tournamentName}文字以内で入力してください`;

  if (!date) errors.date = '開催日を入力してください';
  else if (!isValidIsoDate(date)) errors.date = '開催日の形式が正しくありません';

  if (!place) errors.place = '開催場所を入力してください';
  else if (charLength(place) > LIMITS.place)
    errors.place = `開催場所は${LIMITS.place}文字以内で入力してください`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, date, place } };
}

// ---------- 競技情報（3.2） ----------

export type CompetitionInput = Omit<Competition, 'tournamentId'>;

export const DEFAULT_COMPETITION_FORM = {
  rounds: 1,
  holeInOneConversionEnabled: true,
  holeInOneConversionValue: -2,
  maxPartySize: 6,
  partyAssignmentMethod: null as PartyAssignmentMethod | null,
  teamBattleEnabled: false,
  teamRankingMethod: null as TeamRankingMethod | null,
};

export function validateCompetitionInput(raw: unknown): ValidationResult<CompetitionInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  if (!isIntInRange(r.rounds, LIMITS.rounds.min, LIMITS.rounds.max))
    errors.rounds = `ラウンド数は${LIMITS.rounds.min}〜${LIMITS.rounds.max}の範囲で入力してください`;

  if (typeof r.holeInOneConversionEnabled !== 'boolean')
    errors.holeInOneConversionEnabled = 'ホールインワン時のスコア変換を指定してください';

  // 変換値は「変換あり」の場合のみ必須・有効（変換なしの場合は保存しない）
  if (
    r.holeInOneConversionEnabled === true &&
    !isIntInRange(r.holeInOneConversionValue, LIMITS.holeInOneValue.min, LIMITS.holeInOneValue.max)
  )
    errors.holeInOneConversionValue = `ホールインワン時のスコア変換値は${LIMITS.holeInOneValue.min}〜${LIMITS.holeInOneValue.max}の範囲で入力してください`;

  if (!isIntInRange(r.maxPartySize, LIMITS.maxPartySize.min, LIMITS.maxPartySize.max))
    errors.maxPartySize = `パーティの最大人数は${LIMITS.maxPartySize.min}〜${LIMITS.maxPartySize.max}の範囲で入力してください`;

  if (r.partyAssignmentMethod !== 'チーム' && r.partyAssignmentMethod !== 'シャッフル')
    errors.partyAssignmentMethod = 'パーティの決定方法を選択してください';

  if (typeof r.teamBattleEnabled !== 'boolean') errors.teamBattleEnabled = 'チーム戦を指定してください';

  // 順位決定方法は「チーム戦あり」の場合のみ必須・有効
  if (r.teamBattleEnabled === true && r.teamRankingMethod !== '合計' && r.teamRankingMethod !== '平均')
    errors.teamRankingMethod = 'チーム戦の順位決定方法を選択してください';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const enabled = r.holeInOneConversionEnabled as boolean;
  const team = r.teamBattleEnabled as boolean;
  return {
    ok: true,
    value: {
      rounds: r.rounds as number,
      holeInOneConversionEnabled: enabled,
      holeInOneConversionValue: enabled ? (r.holeInOneConversionValue as number) : null,
      maxPartySize: r.maxPartySize as number,
      partyAssignmentMethod: r.partyAssignmentMethod as PartyAssignmentMethod,
      teamBattleEnabled: team,
      teamRankingMethod: team ? (r.teamRankingMethod as TeamRankingMethod) : null,
    },
  };
}

// ---------- 選手情報（3.3） ----------

export type PlayerInput = {
  /** 既存選手の場合のID（新規は未指定） */
  id?: string;
  name: string;
  /** 入力文字列（YYYY/MM/DD または S/H/R YY.MM.DD） */
  birthDate: string;
  teamName: string;
  partyFixed: boolean;
  partyNumber: number | null;
  /** 不参加（未指定は参加） */
  absent?: boolean;
};

export type NormalizedPlayerInput = Omit<PlayerInput, 'birthDate' | 'absent'> & { birthDate: string; absent: boolean };

/** チーム名が必須となる条件（チーム戦あり、またはパーティの決定方法がチーム） */
export function isTeamNameRequired(competition: Pick<Competition, 'teamBattleEnabled' | 'partyAssignmentMethod'> | null): boolean {
  if (!competition) return false;
  return competition.teamBattleEnabled || competition.partyAssignmentMethod === 'チーム';
}

export function validatePlayerInput(
  raw: unknown,
  competition: Pick<Competition, 'teamBattleEnabled' | 'partyAssignmentMethod'> | null,
): ValidationResult<NormalizedPlayerInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const errors: FieldErrors = {};
  const name = str(r.name);
  const teamName = str(r.teamName);
  const birthRaw = str(r.birthDate);

  if (!name) errors.name = '選手名を入力してください';
  else if (charLength(name) > LIMITS.playerName)
    errors.name = `選手名は${LIMITS.playerName}文字以内で入力してください`;

  let birthDate: string | null = null;
  if (!birthRaw) errors.birthDate = '生年月日を入力してください';
  else {
    birthDate = parseBirthDate(birthRaw);
    if (!birthDate)
      errors.birthDate = '生年月日は YYYY/MM/DD または S・H・R+YY.MM.DD（例：S46.05.24）で入力してください';
  }

  if (charLength(teamName) > LIMITS.teamName)
    errors.teamName = `チーム名は${LIMITS.teamName}文字以内で入力してください`;
  else if (!teamName && isTeamNameRequired(competition)) errors.teamName = 'チーム名を入力してください';

  if (typeof r.partyFixed !== 'boolean') errors.partyFixed = 'パーティ固定を指定してください';

  const partyFixed = r.partyFixed === true;
  if (partyFixed && !isIntInRange(r.partyNumber, LIMITS.partyNumber.min, LIMITS.partyNumber.max))
    errors.partyNumber = `パーティ番号は${LIMITS.partyNumber.min}〜${LIMITS.partyNumber.max}の範囲で入力してください`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...(typeof r.id === 'string' && r.id ? { id: r.id } : {}),
      name,
      birthDate: birthDate as string,
      teamName,
      partyFixed,
      partyNumber: partyFixed ? (r.partyNumber as number) : null,
      absent: r.absent === true,
    },
  };
}

/**
 * 大会の選手一覧（保存後の全件）をまとめて検証する。
 * 各選手の項目検証に加え、同一大会内での選手名の重複を検出する。
 * 戻り値の errors は配列インデックスごとの項目エラー。
 */
export function validatePlayerList(
  raws: unknown[],
  competition: Pick<Competition, 'teamBattleEnabled' | 'partyAssignmentMethod'> | null,
):
  | { ok: true; value: NormalizedPlayerInput[] }
  | { ok: false; errors: Record<number, FieldErrors> } {
  const errors: Record<number, FieldErrors> = {};
  const values: NormalizedPlayerInput[] = [];
  raws.forEach((raw, i) => {
    const res = validatePlayerInput(raw, competition);
    if (res.ok) values[i] = res.value;
    else errors[i] = res.errors;
  });

  // 選手名の重複（同一大会内）
  const seen = new Map<string, number>();
  raws.forEach((raw, i) => {
    const name = str((raw as Record<string, unknown> | null)?.name);
    if (!name) return;
    if (seen.has(name)) {
      errors[i] = { ...(errors[i] ?? {}), name: `選手名「${name}」は既に登録されています` };
    } else seen.set(name, i);
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: values };
}

// ---------- スコア（3.6） ----------

/** 1ラウンド8ホール分の打数（各1〜99の整数）かどうか */
export function isValidHoleStrokes(holes: unknown): holes is number[] {
  return (
    Array.isArray(holes) &&
    holes.length === 8 &&
    holes.every((h) => isIntInRange(h, LIMITS.strokes.min, LIMITS.strokes.max))
  );
}

export function isValidStartHole(value: unknown): value is number {
  return isIntInRange(value, LIMITS.startHole.min, LIMITS.startHole.max);
}
