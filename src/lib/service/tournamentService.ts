// 大会運営の業務ロジック（ブロック系ルール・カスケード削除・生成・スコア保存・順位表作成）。
// ストアの読み書きはすべて本モジュールを経由する。

import { randomUUID } from 'crypto';
import type {
  Competition,
  Db,
  Party,
  Player,
  RankingSnapshot,
  Score,
  Tournament,
  TournamentStatus,
} from '@/types/tournament';
import { generatePairings, unavailableStartHoles, type Rng } from '@/lib/domain/pairing';
import { applyManualRank, computeRankings, type ManualRankTarget } from '@/lib/domain/ranking';
import {
  isValidHoleStrokes,
  isValidStartHole,
  validateCompetitionInput,
  validatePlayerList,
  validateTournamentInput,
  type CompetitionInput,
} from '@/lib/domain/validation';
import { loadDb, updateDb } from '@/lib/store/db';
import { AppError, MESSAGES } from './errors';

// ---------- 参照系 ----------

export type TournamentDetail = {
  tournament: Tournament;
  competition: Competition | null;
  players: Player[];
  parties: Party[];
  scores: Score[];
  ranking: RankingSnapshot | null;
  hasPairings: boolean;
  hasResults: boolean;
};

export async function listTournaments(): Promise<Tournament[]> {
  const db = await loadDb();
  return [...db.tournaments].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
  );
}

export function buildDetail(db: Db, id: string): TournamentDetail | null {
  const tournament = db.tournaments.find((t) => t.id === id);
  if (!tournament) return null;
  const parties = db.parties.filter((p) => p.tournamentId === id).sort((a, b) => a.partyNumber - b.partyNumber);
  const scores = db.scores.filter((s) => s.tournamentId === id);
  return {
    tournament,
    competition: db.competitions.find((c) => c.tournamentId === id) ?? null,
    players: db.players.filter((p) => p.tournamentId === id).sort((a, b) => a.order - b.order),
    parties,
    scores,
    ranking: db.rankings.find((r) => r.tournamentId === id) ?? null,
    hasPairings: parties.length > 0,
    hasResults: scores.length > 0,
  };
}

export async function getTournamentDetail(id: string): Promise<TournamentDetail | null> {
  return buildDetail(await loadDb(), id);
}

// ---------- 内部ヘルパー ----------

function requireTournament(db: Db, id: string): Tournament {
  const t = db.tournaments.find((x) => x.id === id);
  if (!t) throw new AppError('NOT_FOUND', '大会が見つかりません');
  return t;
}

function requireInProgress(t: Tournament): void {
  if (t.status === '終了') throw new AppError('TOURNAMENT_FINISHED', MESSAGES.finished);
}

function hasResults(db: Db, id: string): boolean {
  return db.scores.some((s) => s.tournamentId === id);
}

function hasPairings(db: Db, id: string): boolean {
  return db.parties.some((p) => p.tournamentId === id);
}

/** 組合せ表・スコア表（＋それを元にした順位表）を削除する */
function resetPairings(db: Db, id: string): void {
  db.parties = db.parties.filter((p) => p.tournamentId !== id);
  db.scores = db.scores.filter((s) => s.tournamentId !== id);
  db.rankings = db.rankings.filter((r) => r.tournamentId !== id);
}

// ---------- 大会情報（3.1） ----------

export async function createTournament(raw: unknown, now: Date = new Date()): Promise<Tournament> {
  const v = validateTournamentInput(raw);
  if (!v.ok) throw new AppError('VALIDATION_ERROR', '入力内容に誤りがあります', v.errors);
  return updateDb((db) => {
    const t: Tournament = { id: randomUUID(), ...v.value, status: '進行中', createdAt: now.toISOString() };
    db.tournaments.push(t);
    return t;
  });
}

export async function updateTournament(id: string, raw: unknown): Promise<Tournament> {
  const v = validateTournamentInput(raw);
  return updateDb((db) => {
    const t = requireTournament(db, id);
    requireInProgress(t);
    if (!v.ok) throw new AppError('VALIDATION_ERROR', '入力内容に誤りがあります', v.errors);
    Object.assign(t, v.value);
    return t;
  });
}

/** 大会の削除。紐づく競技情報・選手情報・組合せ表・スコア表・順位表を連鎖的に削除する（ステータスに関わらず実行可） */
export async function deleteTournament(id: string): Promise<void> {
  await updateDb((db) => {
    requireTournament(db, id);
    db.tournaments = db.tournaments.filter((t) => t.id !== id);
    db.competitions = db.competitions.filter((c) => c.tournamentId !== id);
    db.players = db.players.filter((p) => p.tournamentId !== id);
    resetPairings(db, id);
  });
}

export async function setTournamentStatus(id: string, status: unknown): Promise<Tournament> {
  if (status !== '進行中' && status !== '終了')
    throw new AppError('VALIDATION_ERROR', 'ステータスは「進行中」または「終了」を指定してください');
  return updateDb((db) => {
    const t = requireTournament(db, id);
    t.status = status as TournamentStatus;
    return t;
  });
}

// ---------- 競技情報（3.2） ----------

function competitionChanged(before: Competition, after: CompetitionInput): boolean {
  return (Object.keys(after) as (keyof CompetitionInput)[]).some((k) => before[k] !== after[k]);
}

export async function saveCompetition(id: string, raw: unknown, confirmReset: boolean): Promise<Competition> {
  const v = validateCompetitionInput(raw);
  return updateDb((db) => {
    const t = requireTournament(db, id);
    requireInProgress(t);
    if (!v.ok) throw new AppError('VALIDATION_ERROR', '入力内容に誤りがあります', v.errors);

    const existing = db.competitions.find((c) => c.tournamentId === id) ?? null;
    const changed = existing ? competitionChanged(existing, v.value) : true;

    if (existing && changed) {
      // 試合結果が1件でもあれば全項目の変更をブロック
      if (hasResults(db, id)) throw new AppError('RESULTS_EXIST', MESSAGES.resultsExistCompetition);
      // 組合せ表生成済み・試合結果未入力 → 確認のうえ組合せ表・スコア表を削除
      if (hasPairings(db, id)) {
        if (!confirmReset) throw new AppError('CONFIRM_REQUIRED', MESSAGES.confirmReset);
        resetPairings(db, id);
      }
    }

    const next: Competition = { tournamentId: id, ...v.value };
    db.competitions = db.competitions.filter((c) => c.tournamentId !== id);
    db.competitions.push(next);
    return next;
  });
}

// ---------- 選手情報（3.3） ----------

/**
 * 選手一覧の一括保存（新規登録・編集・削除をまとめて反映する）。
 * raws は保存後の全選手（既存選手は id を指定、新規は id なし）。一覧に含まれない既存選手は削除する。
 */
export async function savePlayers(id: string, raws: unknown, confirmReset: boolean): Promise<Player[]> {
  if (!Array.isArray(raws)) throw new AppError('VALIDATION_ERROR', '選手一覧の形式が正しくありません');
  return updateDb((db) => {
    const t = requireTournament(db, id);
    requireInProgress(t);
    const competition = db.competitions.find((c) => c.tournamentId === id) ?? null;

    const v = validatePlayerList(raws, competition);
    if (!v.ok) throw new AppError('VALIDATION_ERROR', '入力内容に誤りがあります', v.errors);

    const current = db.players.filter((p) => p.tournamentId === id);
    const currentById = new Map(current.map((p) => [p.id, p]));
    for (const input of v.value) {
      if (input.id && !currentById.has(input.id)) throw new AppError('NOT_FOUND', '選手が見つかりません');
    }
    const keptIds = new Set(v.value.map((x) => x.id).filter((x): x is string => !!x));
    const deleted = current.filter((p) => !keptIds.has(p.id));
    const added = v.value.filter((x) => !x.id);
    const scores = db.scores.filter((s) => s.tournamentId === id);
    const results = scores.length > 0;

    // 組合せ表の編成に影響する変更（パーティ固定・パーティ番号・チーム名・不参加）
    const affecting = v.value.filter((x) => {
      if (!x.id) return false;
      const before = currentById.get(x.id) as Player;
      return (
        before.partyFixed !== x.partyFixed ||
        before.partyNumber !== x.partyNumber ||
        before.teamName !== x.teamName ||
        before.absent !== x.absent
      );
    });

    // 選手名・生年月日の変更（試合結果がある場合は訂正として許可し、組合せ表は保持する）
    const renamed = v.value.filter((x) => {
      if (!x.id) return false;
      const before = currentById.get(x.id) as Player;
      return before.name !== x.name || before.birthDate !== x.birthDate;
    });

    if (results) {
      const withResults = deleted.filter((p) => scores.some((s) => s.playerId === p.id));
      if (withResults.length > 0)
        throw new AppError(
          'RESULTS_EXIST',
          `試合結果が登録されている選手は削除できません（${withResults.map((p) => p.name).join('、')}）`,
        );
      if (affecting.length > 0)
        throw new AppError(
          'RESULTS_EXIST',
          '試合結果が登録されているため、パーティ固定・パーティ番号・チーム名・不参加は変更できません',
        );
    } else if (
      hasPairings(db, id) &&
      (added.length > 0 || deleted.length > 0 || affecting.length > 0 || renamed.length > 0)
    ) {
      // 試合結果が未入力なら、選手名・生年月日を含むいずれの変更でも確認のうえ組合せ表・スコア表を削除する（要件定義書2.1）
      if (!confirmReset) throw new AppError('CONFIRM_REQUIRED', MESSAGES.confirmReset);
      resetPairings(db, id);
    }

    // 反映（登録順を維持し、新規は末尾に追加）
    let order = current.reduce((m, p) => Math.max(m, p.order), 0);
    const next: Player[] = v.value.map((x) => {
      const before = x.id ? currentById.get(x.id) : undefined;
      return {
        id: before?.id ?? randomUUID(),
        tournamentId: id,
        name: x.name,
        birthDate: x.birthDate,
        teamName: x.teamName,
        partyFixed: x.partyFixed,
        partyNumber: x.partyNumber,
        absent: x.absent,
        order: before?.order ?? ++order,
      };
    });
    db.players = [...db.players.filter((p) => p.tournamentId !== id), ...next];

    // 試合結果がある状態で削除した（結果のない）選手は、組合せ表から外す
    if (deleted.length > 0) {
      const deletedIds = new Set(deleted.map((p) => p.id));
      db.parties = db.parties
        .map((p) => (p.tournamentId === id ? { ...p, playerIds: p.playerIds.filter((pid) => !deletedIds.has(pid)) } : p))
        .filter((p) => p.playerIds.length > 0);
    }
    return next.sort((a, b) => a.order - b.order);
  });
}

// ---------- 組合せ表・スコア表生成（3.4・3.5） ----------

export async function generateTournamentPairings(id: string, rng: Rng = Math.random): Promise<Party[]> {
  return updateDb((db) => {
    const t = requireTournament(db, id);
    requireInProgress(t);
    if (hasResults(db, id))
      throw new AppError('RESULTS_EXIST', '試合結果が入力されています。試合結果を削除して下さい。');

    const players = db.players.filter((p) => p.tournamentId === id).sort((a, b) => a.order - b.order);
    const competition = db.competitions.find((c) => c.tournamentId === id) ?? null;
    const result = generatePairings(players, competition, rng);
    if (!result.ok) throw new AppError('PAIRING_ERROR', result.message);

    resetPairings(db, id);
    const parties: Party[] = result.parties.map((p) => ({ tournamentId: id, ...p }));
    db.parties.push(...parties);
    return parties;
  });
}

export async function updateStartHole(id: string, partyNumber: number, startHole: unknown): Promise<Party> {
  return updateDb((db) => {
    const t = requireTournament(db, id);
    requireInProgress(t);
    if (!isValidStartHole(startHole))
      throw new AppError('VALIDATION_ERROR', '開始ホールは1〜8の範囲で指定してください');
    const party = db.parties.find((p) => p.tournamentId === id && p.partyNumber === partyNumber);
    if (!party) throw new AppError('NOT_FOUND', 'パーティが見つかりません');
    // 同じ開始グループの他パーティに割り当て済みの開始ホールは選択できない
    const parties = db.parties.filter((p) => p.tournamentId === id);
    const usedBy = unavailableStartHoles(parties, partyNumber).get(startHole);
    if (usedBy !== undefined)
      throw new AppError(
        'VALIDATION_ERROR',
        `開始ホール${startHole}は、同じ開始グループのパーティ${usedBy}に割り当て済みのため選択できません`,
      );
    party.startHole = startHole;
    return party;
  });
}

// ---------- スコア入力（3.6） ----------

function requirePartyRound(db: Db, id: string, partyNumber: number, round: unknown): Party {
  const party = db.parties.find((p) => p.tournamentId === id && p.partyNumber === partyNumber);
  if (!party) throw new AppError('NOT_FOUND', 'パーティが見つかりません');
  const competition = db.competitions.find((c) => c.tournamentId === id);
  const rounds = competition?.rounds ?? 0;
  if (typeof round !== 'number' || !Number.isInteger(round) || round < 1 || round > rounds)
    throw new AppError('VALIDATION_ERROR', `ラウンドは1〜${rounds}の範囲で指定してください`);
  return party;
}

/**
 * パーティ内全選手の1ラウンド8ホール分のスコアを一括保存する（ホール単位の部分保存は不可）。
 * scores は { [playerId]: ホール1〜8順の打数 }。
 */
export async function saveRoundScores(
  id: string,
  partyNumber: number,
  round: unknown,
  scores: unknown,
): Promise<Score[]> {
  return updateDb((db) => {
    const t = requireTournament(db, id);
    requireInProgress(t);
    const party = requirePartyRound(db, id, partyNumber, round);
    const r = round as number;

    if (!scores || typeof scores !== 'object')
      throw new AppError('VALIDATION_ERROR', 'スコアを入力してください');
    const map = scores as Record<string, unknown>;
    const keys = Object.keys(map);
    if (keys.length !== party.playerIds.length || !party.playerIds.every((pid) => keys.includes(pid)))
      throw new AppError('VALIDATION_ERROR', 'パーティ内の全選手のスコアを入力してください');
    for (const pid of party.playerIds) {
      if (!isValidHoleStrokes(map[pid]))
        throw new AppError('VALIDATION_ERROR', '打数は1〜99の整数で8ホール分を入力してください');
    }

    db.scores = db.scores.filter(
      (s) => !(s.tournamentId === id && s.round === r && party.playerIds.includes(s.playerId)),
    );
    const saved: Score[] = party.playerIds.map((pid) => ({
      tournamentId: id,
      playerId: pid,
      round: r,
      holes: [...(map[pid] as number[])],
    }));
    db.scores.push(...saved);
    return saved;
  });
}

/** パーティの1ラウンド分のスコアを削除し、未入力に戻す */
export async function deleteRoundScores(id: string, partyNumber: number, round: unknown): Promise<void> {
  await updateDb((db) => {
    const t = requireTournament(db, id);
    requireInProgress(t);
    const party = requirePartyRound(db, id, partyNumber, round);
    db.scores = db.scores.filter(
      (s) => !(s.tournamentId === id && s.round === round && party.playerIds.includes(s.playerId)),
    );
  });
}

// ---------- 順位表（3.7） ----------

export async function generateRanking(id: string, now: Date = new Date()): Promise<RankingSnapshot> {
  return updateDb((db) => {
    const t = requireTournament(db, id);
    // 「終了」の間は順位表の作成も行えない（要件定義書2.1）
    requireInProgress(t);
    const competition = db.competitions.find((c) => c.tournamentId === id);
    if (!competition) throw new AppError('VALIDATION_ERROR', '競技情報が登録されていません');
    const computed = computeRankings({
      players: db.players.filter((p) => p.tournamentId === id),
      scores: db.scores.filter((s) => s.tournamentId === id),
      competition,
      tournamentDate: t.date,
    });
    const snapshot: RankingSnapshot = { tournamentId: id, createdAt: now.toISOString(), ...computed };
    db.rankings = [...db.rankings.filter((r) => r.tournamentId !== id), snapshot];
    return snapshot;
  });
}

export async function confirmManualRank(id: string, target: unknown, rank: unknown): Promise<RankingSnapshot> {
  const tg = (target ?? {}) as Record<string, unknown>;
  let parsed: ManualRankTarget;
  if (tg.kind === 'individual' && typeof tg.playerId === 'string') parsed = { kind: 'individual', playerId: tg.playerId };
  else if (tg.kind === 'team' && typeof tg.teamName === 'string') parsed = { kind: 'team', teamName: tg.teamName };
  else throw new AppError('VALIDATION_ERROR', '確定対象の指定が正しくありません');

  return updateDb((db) => {
    const t = requireTournament(db, id);
    // 「終了」の間は順位の手動確定（じゃんけん結果の確定）も行えない（要件定義書2.1）
    requireInProgress(t);
    const snapshot = db.rankings.find((r) => r.tournamentId === id);
    if (!snapshot) throw new AppError('NOT_FOUND', '順位表が作成されていません');
    const res = applyManualRank(snapshot, parsed, rank);
    if (!res.ok) throw new AppError('VALIDATION_ERROR', res.message);
    db.rankings = [...db.rankings.filter((r) => r.tournamentId !== id), res.snapshot];
    return res.snapshot;
  });
}
