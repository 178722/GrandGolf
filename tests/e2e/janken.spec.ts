// E2E-03 同スコア・同年齢によるじゃんけん待ちと手動確定（docs/E2Eテスト.md）
// 同じ生年月日を3通りの形式（和暦大文字・西暦・和暦小文字）で登録した3名が同スコアでじゃんけん待ちになり、
// 手動確定（範囲外・重複のエラーを含む）、大会終了中の手動確定不可（仕様変更）、再開後の確定、
// 「順位表作成」の再実行で手動確定が消えることを確認する。

import { expect, test } from '@playwright/test';
import { expectedIndividual, scoreTable } from './fixtures/expected';
import { JANKEN as DATA, JANKEN_GROUP } from './fixtures/samples';
import {
  button,
  confirmManualRank,
  createPairings,
  enterAllScores,
  finishTournament,
  generateRankings,
  loginAsAdmin,
  openPairingsPage,
  openRankingsTab,
  rankingRow,
  readIndividualRanking,
  registerDataset,
  restartTournament,
} from './support/ui';

test('E2E-03 同スコア・同年齢のじゃんけん待ちを手動確定する', async ({ page }) => {
  const row = (name: string) => rankingRow(page, 'individual-row', name);
  const [jan, ken, pon] = JANKEN_GROUP;

  await test.step('1. 大会・競技情報・選手7名を登録し、組合せ表作成・スコア入力を行う', async () => {
    await loginAsAdmin(page);
    await registerDataset(page, DATA);
    await createPairings(page);
    await openPairingsPage(page);
    await enterAllScores(page, DATA.competition.rounds, scoreTable(DATA));
  });

  await test.step('2. 順位表を作成すると、同スコア・同生年月日の3名が2位タイの「じゃんけん待ち」になる', async () => {
    await openRankingsTab(page);
    await generateRankings(page);
    const expected = expectedIndividual(DATA);
    expect(expected.filter((e) => e.janken).map((e) => e.name)).toEqual(JANKEN_GROUP);
    await expect
      .poll(() => readIndividualRanking(page))
      .toEqual(expected.map((e) => [e.rank, e.name, e.total, e.janken]));
    for (const name of JANKEN_GROUP) {
      await expect(row(name).getByRole('cell').first()).toHaveText('2');
      await expect(row(name)).toContainText('じゃんけん待ち');
      await expect(button(row(name), '手動確定')).toBeEnabled();
    }
    // 同スコアでも1日若い「あいこ」は5位で、じゃんけん待ちにならない
    await expect(row('あいこ').getByRole('cell').first()).toHaveText('5');
    await expect(row('あいこ')).not.toContainText('じゃんけん待ち');
  });

  await test.step('3. 範囲外の順位はエラーになり、範囲内の順位で確定できる', async () => {
    await confirmManualRank(page, row(jan), jan, [2, 4], 5, '確定する順位は2〜4の範囲で入力してください');
    await confirmManualRank(page, row(jan), jan, [2, 4], 3);
    await expect(row(jan).getByRole('cell').first()).toHaveText('3');
    await expect(row(jan)).not.toContainText('じゃんけん待ち');
  });

  await test.step('4. 同じグループで確定済みの順位は入力できず、別の順位で確定できる', async () => {
    await confirmManualRank(page, row(ken), ken, [2, 4], 3, '3位は同じグループ内で既に確定済みです');
    await confirmManualRank(page, row(ken), ken, [2, 4], 2);
    await expect(row(ken).getByRole('cell').first()).toHaveText('2');
  });

  await test.step('5. 大会終了中は「手動確定」「順位表作成」がdisabledになる（仕様変更）', async () => {
    await page.getByRole('link', { name: '← 大会情報' }).click();
    await page.waitForURL(/\/tournaments\/[^/]+$/);
    await finishTournament(page);
    await openPairingsPage(page, '大会を閲覧する');
    await openRankingsTab(page);
    await expect(row(pon)).toContainText('じゃんけん待ち');
    await expect(button(row(pon), '手動確定')).toBeDisabled();
    await expect(button(page, '順位表作成')).toBeDisabled();
  });

  await test.step('6. 大会を再開すると、残りの選手を手動確定できる', async () => {
    await page.getByRole('link', { name: '← 大会情報' }).click();
    await page.waitForURL(/\/tournaments\/[^/]+$/);
    await restartTournament(page);
    await openPairingsPage(page);
    await openRankingsTab(page);
    await confirmManualRank(page, row(pon), pon, [2, 4], 4);
    await expect
      .poll(() => readIndividualRanking(page))
      .toEqual([
        [1, '早川一番', 20, false],
        [2, ken, 30, false],
        [3, jan, 30, false],
        [4, pon, 30, false],
        [5, 'あいこ', 30, false],
        [6, '遅野まけ', 31, false],
        [7, '最後尾', 40, false],
      ]);
    await expect(page.getByText('じゃんけん待ち')).toHaveCount(0);
  });

  await test.step('7. 「順位表作成」を再実行すると手動確定の内容は引き継がれず、再びじゃんけん待ちになる', async () => {
    await generateRankings(page);
    for (const name of JANKEN_GROUP) {
      await expect(row(name).getByRole('cell').first()).toHaveText('2');
      await expect(row(name)).toContainText('じゃんけん待ち');
    }
  });
});
