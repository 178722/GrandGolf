// 業務エラー。APIルートで { error: { code, message } } 形式のレスポンスに変換する。

export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'TOURNAMENT_FINISHED'
  | 'RESULTS_EXIST'
  | 'CONFIRM_REQUIRED'
  | 'PAIRING_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';

const STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  TOURNAMENT_FINISHED: 409,
  RESULTS_EXIST: 409,
  CONFIRM_REQUIRED: 409,
  PAIRING_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    /** 入力欄ごとのエラー（選手一覧の場合は行インデックスごと） */
    readonly details?: unknown,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export const MESSAGES = {
  finished: '大会が終了しているため変更できません',
  viewer: '閲覧モードのため変更できません',
  resultsExistCompetition: '試合結果が登録されているため変更できません',
  confirmReset: '既存の組合せ表・スコア表を削除し、再生成が必要になります。変更しますか？',
} as const;
