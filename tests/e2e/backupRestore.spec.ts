// E2E-06 バックアップ → データ変更 → 復元（docs/E2Eテスト.md）
// 前提データ（大会2件・組合せ表・スコア）はAPIで投入する（補助部分）。
// 手動バックアップ・データ変更（大会名変更・スコア削除・大会削除）・復元は画面操作で行い、
// 復元後にバックアップ時点のデータへ戻り、バックアップ履歴は残ることを確認する。

import { expect, test } from '@playwright/test';
import { totalScore } from './fixtures/expected';
import { BACKUP_MAIN, BACKUP_RENAMED, BACKUP_SUB } from './fixtures/samples';
import { apiLogin, seedDataset } from './support/seed';
import {
  button,
  dialog,
  loginAsAdmin,
  openBackupPage,
  openPairingsPage,
  openTournament,
  roundButton,
  scoreRow,
  tournamentRow,
  waitApi,
} from './support/ui';

test('E2E-06 バックアップしたデータを、変更後に復元して元に戻す', async ({ page, request }) => {
  const c = BACKUP_MAIN.competition;
  let backupLabel = '';

  await test.step('0. 前提データをAPIで投入する（大会2件。1件は組合せ表・全スコアまで）', async () => {
    await apiLogin(request);
    await seedDataset(request, BACKUP_MAIN, { pairings: true, scores: true });
    await seedDataset(request, BACKUP_SUB);
  });

  await test.step('1. ログインし、A8で手動バックアップを作成する', async () => {
    await loginAsAdmin(page);
    await openBackupPage(page);
    const res = waitApi(page, 'POST', '/api/backups');
    await button(page, '手動バックアップ').click();
    expect((await res).ok()).toBeTruthy();
    await expect(page.getByRole('status')).toHaveText('バックアップを作成しました');
    const first = page.getByTestId('backup-row').first();
    await expect(first).toContainText('手動');
    backupLabel = ((await first.textContent()) ?? '').trim();
    expect(backupLabel).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/);
  });

  await test.step('2. データを変更する：大会名を変更する（A3）', async () => {
    await openTournament(page, BACKUP_MAIN.tournament.name);
    await page.getByLabel('大会名').fill(BACKUP_RENAMED);
    const res = waitApi(page, 'PUT', /\/api\/tournaments\/[^/]+$/);
    await button(page, '保存').click();
    expect((await res).ok()).toBeTruthy();
    await expect(page.getByRole('status')).toHaveText('保存しました');
    await expect(page.getByRole('heading', { level: 1, name: BACKUP_RENAMED })).toBeVisible();
  });

  await test.step('3. データを変更する：パーティ1のラウンド1のスコアを削除する（A6）', async () => {
    await openPairingsPage(page);
    await roundButton(page, 1, 1).click();
    const d = dialog(page, 'パーティ1 ラウンド1 スコア入力');
    await button(d, 'このラウンドのスコアを削除').click();
    const confirm = dialog(page, 'スコアの削除');
    await expect(confirm).toContainText('このパーティのこのラウンドのスコアを削除し、未入力に戻します。削除しますか？');
    const res = waitApi(page, 'DELETE', /\/scores$/);
    await button(confirm, '削除する').click();
    expect((await res).ok()).toBeTruthy();
    await expect(d).toBeHidden();
    await expect(roundButton(page, 1, 1)).toContainText('未入力');
    await expect(scoreRow(page, '復元一', 1).getByTestId('total')).toHaveText('ー');
  });

  await test.step('4. データを変更する：もう1件の大会を削除する（A2）', async () => {
    await page.getByRole('link', { name: '← 大会一覧' }).click();
    await page.waitForURL(/\/tournaments$/);
    await button(tournamentRow(page, BACKUP_SUB.tournament.name), '削除').click();
    const d = dialog(page, '大会を削除しますか？');
    await expect(d).toContainText(`この大会（${BACKUP_SUB.tournament.name}）を削除すると`);
    const res = waitApi(page, 'DELETE', /\/api\/tournaments\/[^/]+$/);
    await button(d, '削除する').click();
    expect((await res).ok()).toBeTruthy();
    await expect(tournamentRow(page, BACKUP_SUB.tournament.name)).toHaveCount(0);
  });

  await test.step('5. A8で手順1のバックアップを選択して復元する', async () => {
    await openBackupPage(page);
    await expect(button(page, '復元')).toBeDisabled();
    const row = page.getByTestId('backup-row').filter({ hasText: backupLabel });
    await expect(row).toHaveCount(1);
    await row.getByRole('radio').check();
    await button(page, '復元').click();
    const d = dialog(page, '復元の最終確認');
    await expect(d).toContainText('現在のすべてのデータが、選択したバックアップ');
    await expect(d).toContainText('元に戻せません。復元しますか？');
    const res = waitApi(page, 'POST', /\/restore$/);
    await button(d, '復元する').click();
    expect((await res).ok()).toBeTruthy();
    await expect(page.getByRole('status')).toHaveText('復元しました');
    // バックアップ履歴自体は復元対象に含まれず、残っている
    await expect(page.getByTestId('backup-row').filter({ hasText: backupLabel })).toHaveCount(1);
  });

  await test.step('6. 復元後、バックアップ時点のデータに戻っている', async () => {
    await page.getByRole('link', { name: '← 大会一覧' }).click();
    await page.waitForURL(/\/tournaments$/);
    await expect(tournamentRow(page, BACKUP_MAIN.tournament.name)).toHaveCount(1);
    await expect(tournamentRow(page, BACKUP_RENAMED)).toHaveCount(0);
    await expect(tournamentRow(page, BACKUP_SUB.tournament.name)).toHaveCount(1);

    await openTournament(page, BACKUP_MAIN.tournament.name);
    await openPairingsPage(page);
    await expect(roundButton(page, 1, 1)).toContainText('入力済');
    for (const p of BACKUP_MAIN.players) {
      await expect(scoreRow(page, p.name, 1).getByTestId('total')).toHaveText(String(totalScore(p, c)));
    }
  });
});
