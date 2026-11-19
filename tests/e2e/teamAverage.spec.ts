// E2E-02 チーム戦（平均）の一連フロー（docs/E2Eテスト.md）
// パーティの決定方法「チーム」・パーティ固定・不参加を含む20名を画面で登録し、組合せ表のパーティ編成、
// ホールインワン変換なしのスコア、チーム戦（平均）の総合順位表（同平均は合計年齢で決まる）を確認する。

import { expect, test } from '@playwright/test';
import { expectedIndividual, scoreTable } from './fixtures/expected';
import { TEAM_AVERAGE as DATA, TEAM_AVERAGE_EXPECTED, TEAM_AVERAGE_PARTIES } from './fixtures/samples';
import {
  createPairings,
  enterAllScores,
  generateRankings,
  loginAsAdmin,
  openPairingsPage,
  openRankingsTab,
  readIndividualRanking,
  readParties,
  readTableRows,
  registerDataset,
  scoreRow,
} from './support/ui';

test('E2E-02 チーム戦（平均）：チーム方式の組合せ表からチーム戦順位表まで', async ({ page }) => {
  const c = DATA.competition;

  await test.step('1. ログインし、大会・競技情報（チーム方式・チーム戦あり・平均・変換なし）・選手20名を登録する', async () => {
    await loginAsAdmin(page);
    await registerDataset(page, DATA);
  });

  await test.step('2. 組合せ表を作成し、チーム単位のパーティ編成と開始ホールを確認する', async () => {
    await createPairings(page);
    await openPairingsPage(page);
    const parties = await readParties(page);
    expect(parties.map((p) => p.partyNumber)).toEqual(Object.keys(TEAM_AVERAGE_PARTIES).map(Number));
    for (const party of parties) {
      const exp = TEAM_AVERAGE_PARTIES[party.partyNumber];
      expect(party.startHole).toBe(exp.startHole);
      expect([...party.members].sort()).toEqual([...exp.members].sort());
    }
    // 不参加の選手は組合せ表に含まれない
    await expect(page.getByText('紅葉休')).toHaveCount(0);
    // チーム名の表示
    await expect(scoreRow(page, '𠮷岡二', 1)).toContainText('𠮷祥寺クラブ');
  });

  await test.step('3. 全パーティのスコアを入力する（変換なしのため打数1はそのまま算入）', async () => {
    await enterAllScores(page, c.rounds, scoreTable(DATA));
    const cells = scoreRow(page, '日向陽', 1).getByTestId('hole-cell');
    await expect(cells.first()).toHaveText('1');
    await expect(scoreRow(page, '日向陽', 1).getByTestId('total')).toHaveText('24');
    await expect(scoreRow(page, '𠮷岡一', 1).getByTestId('total')).toHaveText('15');
  });

  await test.step('4. 順位表を作成し、個人戦・チーム戦（平均）の総合順位を確認する', async () => {
    await openRankingsTab(page);
    await generateRankings(page);
    await expect
      .poll(() => readIndividualRanking(page))
      .toEqual(expectedIndividual(DATA).map((e) => [e.rank, e.name, e.total, e.janken]));
    await expect(page.getByRole('heading', { name: 'チーム戦 総合順位表（平均）' })).toBeVisible();
    await expect(page.getByTestId('team-ranking').locator('thead th', { hasText: '平均スコア' })).toBeVisible();
    await expect
      .poll(async () => (await readTableRows(page, 'team-row')).map((r) => r.slice(0, 5)))
      .toEqual(TEAM_AVERAGE_EXPECTED);
    await expect(page.getByText('じゃんけん待ち')).toHaveCount(0);
    await expect(page.getByText('紅葉休')).toHaveCount(0);
  });
});
