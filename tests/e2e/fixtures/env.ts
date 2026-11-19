// E2Eテストの実行環境の定数（playwright.e2e.config.ts と各specで共用する）

/** E2E用の開発サーバーのポート（結合テストの3100とは別） */
export const E2E_PORT = 3200;

/** E2E用のデータ保存先（結合テストの .test-data とは別。テスト開始前に初期化する） */
export const E2E_DATA_DIR = './.e2e-data';

/** E2E用にシードする管理者アカウント（環境変数 ADMIN_ID / ADMIN_PASSWORD に渡す） */
export const E2E_ADMIN = { id: 'e2e-admin', password: 'e2e-password' };
