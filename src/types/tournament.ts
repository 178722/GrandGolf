// 業務データの型定義（docs/要件定義書.md 3章を参照）

export type TournamentStatus = '進行中' | '終了';

export type PartyAssignmentMethod = 'チーム' | 'シャッフル';
export type TeamRankingMethod = '合計' | '平均';

/** 大会情報（3.1）。date は開催日（YYYY-MM-DD） */
export type Tournament = {
  id: string;
  name: string;
  date: string;
  place: string;
  status: TournamentStatus;
  createdAt: string;
};

/** 競技情報（3.2）。1大会につき1件 */
export type Competition = {
  tournamentId: string;
  rounds: number;
  holeInOneConversionEnabled: boolean;
  /** 変換なしの場合は null */
  holeInOneConversionValue: number | null;
  maxPartySize: number;
  partyAssignmentMethod: PartyAssignmentMethod;
  teamBattleEnabled: boolean;
  /** チーム戦なしの場合は null */
  teamRankingMethod: TeamRankingMethod | null;
};

/** 選手情報（3.3）。birthDate は西暦の YYYY-MM-DD に正規化して保存する */
export type Player = {
  id: string;
  tournamentId: string;
  name: string;
  birthDate: string;
  teamName: string;
  partyFixed: boolean;
  /** 非固定の場合は null */
  partyNumber: number | null;
  /** 不参加（選手情報は保存するが、組合せ表の生成対象から除外する） */
  absent: boolean;
  /** 登録順（表示・チーム順の決定に使用） */
  order: number;
};

/** 組合せ表のパーティ（3.4） */
export type Party = {
  tournamentId: string;
  partyNumber: number;
  startHole: number;
  playerIds: string[];
};

/** スコア（3.6）。holes はホール番号1〜8順の打数（表示順ではない） */
export type Score = {
  tournamentId: string;
  playerId: string;
  round: number;
  holes: number[];
};

export type IndividualRankingRow = {
  playerId: string;
  playerName: string;
  teamName: string;
  totalScore: number;
  birthDate: string;
  rank: number;
  /** 順位決定時点の同順位（じゃんけん対象グループの識別に使用） */
  tieRank: number;
  tieSize: number;
  jankenPending: boolean;
};

export type TeamRankingRow = {
  teamName: string;
  memberCount: number;
  totalScore: number;
  averageScore: number;
  totalAgeYears: number;
  totalAgeDays: number;
  /** 比較用：各選手の生後日数の合計 */
  totalAgeInDays: number;
  rank: number;
  tieRank: number;
  tieSize: number;
  jankenPending: boolean;
};

/** 「順位表作成」実行時点の集計結果（3.7） */
export type RankingSnapshot = {
  tournamentId: string;
  createdAt: string;
  individual: IndividualRankingRow[];
  /** チーム戦なしの場合は null */
  team: TeamRankingRow[] | null;
  teamRankingMethod: TeamRankingMethod | null;
  excludedPlayerNames: string[];
};

/** JSONストア全体 */
export type Db = {
  tournaments: Tournament[];
  competitions: Competition[];
  players: Player[];
  parties: Party[];
  scores: Score[];
  rankings: RankingSnapshot[];
};
