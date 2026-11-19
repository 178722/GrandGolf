import { rmSync } from 'fs';
import { defineConfig } from '@playwright/test';

// 結合テスト用の設定。開発サーバーを専用のデータ保存先（.test-data）・専用ポートで起動する。
const PORT = 3100;
export const TEST_DATA_DIR = './.test-data';
export const TEST_ADMIN = { id: 'admin', password: 'password123' };

// テスト開始前にデータ保存先を初期化する（ワーカープロセスでの再読み込み時は実行しない）
if (!process.env.TEST_WORKER_INDEX) {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}

export default defineConfig({
  testDir: './tests/integration',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      GRANDGOLF_DATA_DIR: TEST_DATA_DIR,
      ADMIN_ID: TEST_ADMIN.id,
      ADMIN_PASSWORD: TEST_ADMIN.password,
      SESSION_SECRET: 'integration-test-secret',
    },
  },
});
