import { rmSync } from 'fs';
import { defineConfig } from '@playwright/test';
import { E2E_ADMIN, E2E_DATA_DIR, E2E_PORT } from './tests/e2e/fixtures/env';

// E2Eテスト用の設定（docs/E2Eテスト.md）。
// 開発サーバーを専用のデータ保存先（.e2e-data）・専用ポート（3200）で起動する。
// 結合テスト（playwright.config.ts）と同じく next dev を使うため、.next ディレクトリを共有する。
// 結合テストの開発サーバーと同時には実行しないこと。

// テスト開始前にデータ保存先を初期化する（ワーカープロセスでの再読み込み時は実行しない）
if (!process.env.TEST_WORKER_INDEX) {
  rmSync(E2E_DATA_DIR, { recursive: true, force: true });
}

export default defineConfig({
  testDir: './tests/e2e',
  // シナリオは画面操作で大会を作るため直列に実行する（バックアップの復元は全大会のデータを上書きするため）
  fullyParallel: false,
  workers: 1,
  // 40名の選手登録・全ラウンドのスコア入力を画面操作で行うシナリオがあるため長めにとる
  timeout: 600_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx next dev -p ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      GRANDGOLF_DATA_DIR: E2E_DATA_DIR,
      ADMIN_ID: E2E_ADMIN.id,
      ADMIN_PASSWORD: E2E_ADMIN.password,
      SESSION_SECRET: 'e2e-test-secret',
    },
  },
});
