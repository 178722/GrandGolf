// E2E-05 閲覧モード（docs/E2Eテスト.md）
// 前提データ（組合せ表・スコア・順位表・バックアップ）はAPIで投入する（補助部分）。
// 閲覧モードで全画面（A2〜A8）を閲覧でき、書き換え操作はすべてdisabled（APIでも拒否）であることを確認する。
// 仕様変更：A3〜A5の「組合せ表を作成する」「大会を開催する」、A3・A4の「保存」「キャンセル」は表示したままdisabled。

import { expect, test } from '@playwright/test';
import { expectedIndividual } from './fixtures/expected';
import { VIEWER as DATA } from './fixtures/samples';
import { apiLogin, seedBackup, seedDataset } from './support/seed';
import {
  button,
  dialog,
  loginAsViewer,
  openPairingsPage,
  openRankingsTab,
  openTab,
  openTournament,
  readIndividualRanking,
  readParties,
  scoreRow,
  tournamentRow,
  waitApi,
} from './support/ui';

const VIEWER_REASON = '閲覧モードのため変更できません';

test('E2E-05 閲覧モードで全画面を閲覧でき、書き換え操作はできない', async ({ page, request }) => {
  let tournamentId = '';

  await test.step('0. 前提データをAPIで投入する（組合せ表・全スコア・順位表・手動バックアップ）', async () => {
    await apiLogin(request);
    const seeded = await seedDataset(request, DATA, { pairings: true, scores: true, rankings: true });
    tournamentId = seeded.id;
    await seedBackup(request);
  });

  await test.step('1. ログイン画面の「閲覧モードで見る」でA2を開く', async () => {
    await loginAsViewer(page);
    await expect(button(page, '+ 新規作成')).toBeDisabled();
    await expect(button(tournamentRow(page, DATA.tournament.name), '削除')).toBeDisabled();
    // 新規作成画面へ直接アクセスしてもA2へ戻される
    await page.goto('/tournaments/new');
    await page.waitForURL(/\/tournaments$/);
  });

  await test.step('2. A3：入力欄・ボタンがdisabled（「大会を閲覧する」のみ有効）', async () => {
    await openTournament(page, DATA.tournament.name);
    await expect(page.getByLabel('大会名')).toBeDisabled();
    await expect(page.getByLabel('大会名')).toHaveValue(DATA.tournament.name);
    await expect(page.getByLabel('開催日')).toBeDisabled();
    await expect(page.getByLabel('開催場所')).toBeDisabled();
    await expect(button(page, '保存')).toBeDisabled();
    await expect(button(page, 'キャンセル')).toBeDisabled();
    await expect(button(page, '組合せ表を作成する')).toBeDisabled();
    await expect(button(page, '大会を開催する')).toBeDisabled();
    await expect(button(page, '大会を終了する')).toBeDisabled();
    await expect(button(page, '大会を閲覧する')).toBeEnabled();
    await expect(page.getByText(VIEWER_REASON)).toBeVisible();
  });

  await test.step('3. A4：登録済みの競技情報を閲覧でき、変更できない', async () => {
    await openTab(page, '競技情報');
    await expect(page.getByLabel('ラウンド数')).toHaveValue('1');
    await expect(page.getByLabel('ラウンド数')).toBeDisabled();
    await expect(page.getByLabel('パーティの最大人数')).toHaveValue('4');
    await expect(page.getByRole('radio', { name: 'シャッフル', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'シャッフル', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: '変換あり' })).toBeDisabled();
    await expect(button(page, '保存')).toBeDisabled();
    await expect(button(page, '組合せ表を作成する')).toBeDisabled();
    await expect(page.getByText(VIEWER_REASON)).toBeVisible();
  });

  await test.step('4. A5：選手一覧を閲覧でき、登録・編集・不参加・削除・保存はできない', async () => {
    await openTab(page, '選手情報');
    await expect(page.getByTestId('player-row')).toHaveCount(DATA.players.length);
    await expect(button(page, '+ 新規登録')).toBeDisabled();
    await expect(button(page, '保存')).toBeDisabled();
    const rowButtons = await page.getByTestId('player-row').getByRole('button').all();
    expect(rowButtons.length).toBe(DATA.players.length * 3);
    for (const b of rowButtons) await expect(b).toBeDisabled();
    await expect(page.getByText(VIEWER_REASON)).toBeVisible();
  });

  await test.step('5. A6：組合せ・スコア表を閲覧でき、開始ホール変更・スコア入力はできない', async () => {
    await openPairingsPage(page, '大会を閲覧する');
    await expect(page.getByText(VIEWER_REASON)).toBeVisible();
    const parties = await readParties(page);
    expect(parties.flatMap((p) => p.members).length).toBe(DATA.players.filter((p) => !p.absent).length);
    await expect(scoreRow(page, '閲覧一郎', 1).getByTestId('total')).toHaveText('19');
    for (const b of await page.getByRole('button', { name: '変更', exact: true }).all()) await expect(b).toBeDisabled();
    const scoreButtons = await page.getByRole('button', { name: /^ラウンド\d：/ }).all();
    expect(scoreButtons.length).toBe(parties.length);
    for (const b of scoreButtons) {
      await expect(b).toContainText('入力済');
      await expect(b).toBeDisabled();
    }
  });

  await test.step('6. A7：順位表を閲覧でき、「順位表作成」「手動確定」はできない', async () => {
    await openRankingsTab(page);
    await expect
      .poll(() => readIndividualRanking(page))
      .toEqual(expectedIndividual(DATA).map((e) => [e.rank, e.name, e.total, e.janken]));
    await expect(button(page, '順位表作成')).toBeDisabled();
    const confirms = await page.getByRole('button', { name: '手動確定', exact: true }).all();
    expect(confirms.length).toBe(2);
    for (const b of confirms) await expect(b).toBeDisabled();
  });

  await test.step('7. APIでも書き換え操作は拒否される', async () => {
    const pairings = await page.request.post(`/api/tournaments/${tournamentId}/pairings`);
    expect(pairings.status()).toBe(403);
    const rankings = await page.request.post(`/api/tournaments/${tournamentId}/rankings`);
    expect(rankings.status()).toBe(403);
    const backup = await page.request.post('/api/backups');
    expect(backup.status()).toBe(403);
  });

  await test.step('8. A8：履歴を閲覧でき、手動バックアップ・復元はできない', async () => {
    await button(page, 'バックアップ').click();
    await page.waitForURL(/\/settings\/backup$/);
    await expect(page.getByTestId('backup-row').first()).toContainText('手動');
    await expect(button(page, '手動バックアップ')).toBeDisabled();
    await page.getByTestId('backup-row').first().getByRole('radio').check();
    await expect(button(page, '復元')).toBeDisabled();
  });

  await test.step('9. ログアウトでは「バックアップする」がdisabledで、「しない」でログアウトする', async () => {
    await button(page, 'ログアウト').click();
    await button(dialog(page, 'ログアウトしますか？'), 'ログアウトする').click();
    const d = dialog(page, 'バックアップを作成しますか？');
    await expect(button(d, 'バックアップする')).toBeDisabled();
    const res = waitApi(page, 'POST', '/api/auth/logout');
    await button(d, 'しない').click();
    expect((await res).ok()).toBeTruthy();
    await page.waitForURL(/\/login$/);
  });
});
