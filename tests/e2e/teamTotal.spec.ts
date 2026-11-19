// E2E-04 チーム戦（合計）とチームのじゃんけん待ち（docs/E2Eテスト.md）
// 変換値-3のホールインワン、合計方式（人数が少ないチームが有利）、合計年齢の繰り上げなし表示、
// 合計スコア・合計年齢とも同じチームのじゃんけん待ちと手動確定を確認する。

import { expect, test } from '@playwright/test';
import { expectedIndividual, scoreTable } from './fixtures/expected';
import { TEAM_TOTAL as DATA, TEAM_TOTAL_EXPECTED } from './fixtures/samples';
import {
  confirmManualRank,
  createPairings,
  enterAllScores,
  generateRankings,
  loginAsAdmin,
  openPairingsPage,
  openRankingsTab,
  rankingRow,
  readIndividualRanking,
  readParties,
  readTableRows,
  registerDataset,
  scoreRow,
} from './support/ui';

test('E2E-04 チーム戦（合計）：チームのじゃんけん待ちを手動確定する', async ({ page }) => {
  const team = (name: string) => rankingRow(page, 'team-row', name);

  await test.step('1. 大会・競技情報（チーム方式・最大4名・変換-3・チーム戦あり・合計）・選手12名を登録する', async () => {
    await loginAsAdmin(page);
    await registerDataset(page, DATA);
  });

  await test.step('2. 組合せ表を作成し、1チーム＝1パーティ（登録順）で編成されることを確認する', async () => {
    await createPairings(page);
    await openPairingsPage(page);
    const parties = await readParties(page);
    expect(parties.map((p) => [p.partyNumber, p.startHole, p.members.length])).toEqual([
      [1, 1, 3],
      [2, 2, 3],
      [3, 3, 2],
      [4, 4, 4],
    ]);
    expect(parties[0].members.sort()).toEqual(['Ａ山一', 'Ａ山三', 'Ａ山二']);
  });

  await test.step('3. スコアを入力する（ホールインワンは-3に置き換えて算入）', async () => {
    await enterAllScores(page, DATA.competition.rounds, scoreTable(DATA));
    await expect(scoreRow(page, 'Ａ山一', 1).getByTestId('hole-cell').first()).toHaveText('1(-3)');
    await expect(scoreRow(page, 'Ａ山一', 1).getByTestId('subtotal')).toHaveText('11');
  });

  await test.step('4. 順位表を作成し、チーム戦（合計）でＡ組・Ｂ組がじゃんけん待ちになることを確認する', async () => {
    await openRankingsTab(page);
    await generateRankings(page);
    await expect
      .poll(() => readIndividualRanking(page))
      .toEqual(expectedIndividual(DATA).map((e) => [e.rank, e.name, e.total, e.janken]));
    await expect(page.getByRole('heading', { name: 'チーム戦 総合順位表（合計）' })).toBeVisible();
    await expect(page.getByTestId('team-ranking').locator('thead th', { hasText: '合計スコア' })).toBeVisible();
    await expect
      .poll(async () =>
        (await readTableRows(page, 'team-row')).map((r) => [...r.slice(0, 5), r[5].includes('じゃんけん待ち')]),
      )
      .toEqual(TEAM_TOTAL_EXPECTED);
  });

  await test.step('5. Ａ組を3位、Ｂ組を2位に手動確定する', async () => {
    await confirmManualRank(page, team('Ａ組'), 'Ａ組', [2, 3], 3);
    await confirmManualRank(page, team('Ｂ組'), 'Ｂ組', [2, 3], 2);
    await expect
      .poll(async () => (await readTableRows(page, 'team-row')).map((r) => [r[0], r[1], r[5]]))
      .toEqual([
        ['1', 'Ｃ組', ''],
        ['2', 'Ｂ組', ''],
        ['3', 'Ａ組', ''],
        ['4', 'Ｄ組', ''],
      ]);
  });
});
