// E2E-01 個人戦の一連フロー（docs/E2Eテスト.md）
// ログイン → 大会登録 → 競技情報 → 選手40名登録（和暦/西暦）→ 組合せ表作成 → 選手名訂正による組合せ表リセット → 再作成
// → 開始ホール変更 → 全ラウンドのスコア入力（ホールインワン含む）→ 順位表作成・確認 → スコア修正と再作成
// → 大会終了（読み取り専用の確認）→ ログアウト（バックアップする）

import { expect, test } from '@playwright/test';
import { expectedIndividual, holeCellText, scoreTable, totalScore } from './fixtures/expected';
import {
  INDIVIDUAL as DATA,
  INDIVIDUAL_AGE_DECIDED,
  INDIVIDUAL_AGES,
  INDIVIDUAL_CORRECTION,
  INDIVIDUAL_PARTIES,
} from './fixtures/samples';
import {
  button,
  createPairings,
  createTournament,
  dialog,
  enterAllScores,
  expectPlayerRows,
  finishTournament,
  generateRankings,
  loginAsAdmin,
  logout,
  openBackupPage,
  openPairingsPage,
  openRankingsTab,
  openTab,
  partyBody,
  playerRow,
  readIndividualRanking,
  readParties,
  registerPlayers,
  roundButton,
  saveCompetition,
  savePlayers,
  scoreRow,
  waitApi,
} from './support/ui';

test('E2E-01 個人戦：ログインから順位表確認・大会終了・ログアウトまで', async ({ page }) => {
  const c = DATA.competition;

  await test.step('1. 管理者でログインする', async () => {
    await loginAsAdmin(page);
  });

  await test.step('2. 大会を新規登録する', async () => {
    await createTournament(page, DATA.tournament);
    await expect(page.getByText('2026/11/16・E2E市民グラウンド')).toBeVisible();
    // 組合せ表が未作成の間は「大会を開催する」はdisabled
    await expect(button(page, '大会を開催する')).toBeDisabled();
  });

  await test.step('3. 競技情報（2ラウンド・変換-2・最大6名・シャッフル）を登録する', async () => {
    await openTab(page, '競技情報');
    await saveCompetition(page, c);
    await page.reload();
    await expect(page.getByLabel('ラウンド数')).toHaveValue('2');
    await expect(page.getByRole('radio', { name: 'シャッフル', exact: true })).toBeChecked();
  });

  await test.step('4. 選手40名（和暦S/H/R・西暦・うるう日・固定・不参加を含む）を登録する', async () => {
    await openTab(page, '選手情報');
    await registerPlayers(page, DATA.players);
    // 誤記で登録した選手以外の表示（生年月日は西暦表示）を確認する
    await expectPlayerRows(
      page,
      DATA.players.filter((p) => !p.typoName),
    );
    await expect(playerRow(page, '岡田まさお')).toBeVisible();
  });

  await test.step('5. 組合せ表を作成する', async () => {
    await createPairings(page);
  });

  await test.step('6. 選手名を訂正すると、確認の上で組合せ表がリセットされる（仕様変更：全項目が対象）', async () => {
    const typo = DATA.players.find((p) => p.typoName)!;
    await button(playerRow(page, typo.typoName!), '編集').click();
    const d = dialog(page, '選手情報の編集');
    await d.getByLabel('選手名', { exact: true }).fill(typo.name);
    await button(d, '保存して閉じる').click();
    await expect(d).toBeHidden();
    await savePlayers(page, { confirmReset: true });
    await expect(playerRow(page, typo.name)).toBeVisible();
    // 組合せ表が削除されたため「大会を開催する」はdisabledに戻る
    await expect(button(page, '大会を開催する')).toBeDisabled();
  });

  await test.step('7. 組合せ表を再作成し、組合せ・スコア表を開く', async () => {
    await createPairings(page);
    await openPairingsPage(page);
  });

  await test.step('8. パーティ編成・開始ホール・年齢の表示を確認する', async () => {
    const parties = await readParties(page);
    expect(parties.map((p) => p.partyNumber)).toEqual(INDIVIDUAL_PARTIES.partyNumbers);
    for (const party of parties) {
      expect(party.startHole).toBe(INDIVIDUAL_PARTIES.startHoles[party.partyNumber]);
      expect(party.startGroup).toBe(1);
      // 人数を平均（38÷7）に揃える → 5名または6名
      expect(party.members.length).toBeGreaterThanOrEqual(5);
      expect(party.members.length).toBeLessThanOrEqual(c.maxPartySize);
    }
    for (const [n, names] of Object.entries(INDIVIDUAL_PARTIES.fixedMembers)) {
      const party = parties.find((p) => p.partyNumber === Number(n))!;
      expect(party.members).toEqual(expect.arrayContaining(names));
    }
    const all = parties.flatMap((p) => p.members).sort();
    expect(all).toEqual(
      DATA.players
        .filter((p) => !p.absent)
        .map((p) => p.name)
        .sort(),
    );
    // 不参加の選手は組合せ表に含まれない
    for (const p of DATA.players.filter((x) => x.absent)) {
      await expect(page.getByText(p.name)).toHaveCount(0);
    }
    for (const [name, age] of Object.entries(INDIVIDUAL_AGES)) {
      const p = DATA.players.find((x) => x.name === name)!;
      await expect(scoreRow(page, name, 1)).toContainText(p.birthDisplay);
      await expect(scoreRow(page, name, 1)).toContainText(age);
    }
    // ホール列は開始ホールに関わらず1〜8の順
    await expect(partyBody(page, 10).getByTestId('hole-header')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8']);
    // スコア未入力
    await expect(roundButton(page, 1, 1)).toContainText('未入力');
    await expect(scoreRow(page, '青木一郎', 1).getByTestId('total')).toHaveText('ー');
  });

  await test.step('9. パーティ10の開始ホールを7から8に変更する', async () => {
    await button(partyBody(page, 10), '変更').click();
    const d = dialog(page, 'パーティ10 の開始ホール変更');
    const select = d.getByLabel('開始ホール');
    await expect(select).toHaveValue('7');
    // 同じ開始グループの他パーティが使用中の開始ホールは選択できない
    await expect(select.locator('option[value="1"]')).toBeDisabled();
    await expect(select.locator('option[value="1"]')).toHaveText('1（同じ開始グループのパーティ1が使用中）');
    await expect(select.locator('option[value="8"]')).toBeEnabled();
    await select.selectOption('8');
    const res = waitApi(page, 'PUT', /\/start-hole$/);
    await button(d, '保存').click();
    expect((await res).ok()).toBeTruthy();
    await expect(d).toBeHidden();
    await expect(partyBody(page, 10).getByTestId('start-hole')).toHaveText('8');
  });

  await test.step('10. 全パーティ・全ラウンドのスコアを入力する（ホールインワンを含む）', async () => {
    await enterAllScores(page, c.rounds, scoreTable(DATA));
    for (const p of DATA.players.filter((x) => !x.absent)) {
      await expect(scoreRow(page, p.name, 1).getByTestId('total')).toHaveText(String(totalScore(p, c)));
    }
    // ホールインワン（変換あり）のセルは「1(-2)」と変換値を併記し、小計は変換後の値
    const ono = DATA.players.find((x) => x.name === '小野五郎')!;
    await expect(scoreRow(page, '小野五郎', 1).getByTestId('hole-cell')).toHaveText(
      ono.rounds![0].map((s) => holeCellText(s, c)),
    );
    await expect(scoreRow(page, '小野五郎', 1).getByTestId('hole-cell').first()).toHaveText('1(-2)');
    await expect(scoreRow(page, '小野五郎', 1).getByTestId('subtotal')).toHaveText('20');
    await expect(scoreRow(page, '小野五郎', 2).getByTestId('subtotal')).toHaveText('16');
    await expect(scoreRow(page, '小野五郎', 1).getByTestId('total')).toHaveText('36');
  });

  const expected = expectedIndividual(DATA);

  await test.step('11. 順位表を作成し、個人戦の総合順位を確認する', async () => {
    await openRankingsTab(page);
    await expect(page.getByText('「順位表作成」ボタンを押すと、その時点のスコアを集計して表示します。')).toBeVisible();
    await generateRankings(page);
    await expect(page.getByRole('heading', { name: '個人戦 総合順位表' })).toBeVisible();
    // チーム戦なしのためチーム戦順位表は表示しない
    await expect(page.getByRole('heading', { name: /チーム戦 総合順位表/ })).toHaveCount(0);
    await expect
      .poll(() => readIndividualRanking(page))
      .toEqual(expected.map((e) => [e.rank, e.name, e.total, e.janken]));
    await expect(page.getByTestId('individual-row')).toHaveCount(INDIVIDUAL_PARTIES.participants);
    // 同スコアは年齢（生年月日が早い方）で順位が決まり、じゃんけん待ちにはならない
    for (const [upper, lower] of INDIVIDUAL_AGE_DECIDED) {
      const u = expected.find((e) => e.name === upper)!;
      const l = expected.find((e) => e.name === lower)!;
      expect(u.total).toBe(l.total);
      expect(u.rank).toBeLessThan(l.rank);
    }
    await expect(page.getByText('じゃんけん待ち')).toHaveCount(0);
    // 個人戦の順位表には生年月日ではなく年齢を表示する
    await expect(page.getByTestId('individual-row').filter({ hasText: '浜田一' })).toContainText('51歳0日');
    await expect(page.getByTestId('individual-row').filter({ hasText: '浜田一' })).not.toContainText('1975/11/16');
    // 不参加の選手は順位表にも集計対象外の一覧にも出ない
    await expect(page.getByTestId('excluded')).toHaveCount(0);
    for (const p of DATA.players.filter((x) => x.absent)) {
      await expect(page.getByText(p.name)).toHaveCount(0);
    }
  });

  await test.step('12. スコアを修正しても順位表は自動更新されず、「順位表作成」の再実行で反映される', async () => {
    const fix = INDIVIDUAL_CORRECTION;
    await page.getByRole('link', { name: '組合せ・スコア表', exact: true }).click();
    await page.waitForURL(/\/pairings$/);
    const party = (await readParties(page)).find((p) => p.members.includes(fix.name))!;
    await roundButton(page, party.partyNumber, fix.round).click();
    const d = dialog(page, `パーティ${party.partyNumber} ラウンド${fix.round} スコア入力`);
    // 入力済のラウンドは保存済みの打数を初期表示する
    await expect(d.getByLabel(`${fix.name} ホール${fix.hole}`, { exact: true })).toHaveValue('21');
    await d.getByLabel(`${fix.name} ホール${fix.hole}`, { exact: true }).fill(String(fix.strokes));
    const res = waitApi(page, 'PUT', /\/scores$/);
    await button(d, '保存').click();
    expect((await res).ok()).toBeTruthy();
    await expect(d).toBeHidden();
    await expect(scoreRow(page, fix.name, 1).getByTestId('total')).toHaveText(String(fix.newTotal));

    await page.getByRole('link', { name: '順位表', exact: true }).click();
    await page.waitForURL(/\/rankings$/);
    // 再作成前は以前の集計のまま（最下位・70）
    const before = page.getByTestId('individual-row').filter({ hasText: fix.name });
    await expect(before.getByRole('cell').nth(0)).toHaveText(String(expected.length));
    await expect(before.getByRole('cell').nth(3)).toHaveText('70');

    await generateRankings(page);
    const after = expectedIndividual(DATA, { [fix.name]: fix.newTotal });
    await expect
      .poll(() => readIndividualRanking(page))
      .toEqual(after.map((e) => [e.rank, e.name, e.total, e.janken]));
    // 同スコア47のＳｍｉｔｈ花子より年上のため上位
    const k = after.find((e) => e.name === fix.name)!;
    const s = after.find((e) => e.name === 'Ｓｍｉｔｈ花子')!;
    expect(k.total).toBe(s.total);
    expect(k.rank).toBe(s.rank - 1);
  });

  await test.step('13. 大会を終了すると、全画面で変更操作がdisabledになる（仕様変更：ボタンは表示したままdisabled）', async () => {
    await page.getByRole('link', { name: '← 大会情報' }).click();
    await page.waitForURL(/\/tournaments\/[^/]+$/);
    await finishTournament(page);
    const finished = '大会が終了しているため変更できません';

    // A3
    await expect(button(page, '大会を閲覧する')).toBeEnabled();
    await expect(button(page, '大会を再開する')).toBeEnabled();
    await expect(button(page, '組合せ表を作成する')).toBeDisabled();
    await expect(button(page, '大会を開催する')).toBeDisabled();
    await expect(button(page, '大会を終了する')).toHaveCount(0);
    await expect(page.getByLabel('大会名')).toBeDisabled();
    await expect(button(page, '保存')).toBeDisabled();
    await expect(button(page, 'キャンセル')).toBeDisabled();
    await expect(page.getByText(finished)).toBeVisible();

    // A4
    await openTab(page, '競技情報');
    await expect(page.getByLabel('ラウンド数')).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'シャッフル', exact: true })).toBeDisabled();
    await expect(button(page, '保存')).toBeDisabled();
    await expect(button(page, '組合せ表を作成する')).toBeDisabled();
    await expect(page.getByText(finished)).toBeVisible();

    // A5
    await openTab(page, '選手情報');
    await expect(button(page, '+ 新規登録')).toBeDisabled();
    await expect(button(page, '保存')).toBeDisabled();
    for (const b of await page.getByTestId('player-row').getByRole('button').all()) {
      await expect(b).toBeDisabled();
    }
    await expect(page.getByText(finished)).toBeVisible();

    // A6
    await openPairingsPage(page, '大会を閲覧する');
    await expect(page.getByText(finished)).toBeVisible();
    for (const b of await page.getByRole('button', { name: '変更', exact: true }).all()) {
      await expect(b).toBeDisabled();
    }
    for (const b of await page.getByRole('button', { name: /^ラウンド\d：/ }).all()) {
      await expect(b).toBeDisabled();
    }

    // A7（仕様変更：大会終了中は「順位表作成」もdisabled）
    await openRankingsTab(page);
    await expect(button(page, '順位表作成')).toBeDisabled();
    await expect(page.getByTestId('individual-row')).toHaveCount(INDIVIDUAL_PARTIES.participants);
  });

  await test.step('14. ログアウト時に「バックアップする」を選ぶと、契機「ログアウト」のバックアップが作成される', async () => {
    await logout(page, true);
    await loginAsAdmin(page);
    await openBackupPage(page);
    await expect(page.getByTestId('backup-row').first()).toContainText('ログアウト');
    // 大会一覧ではステータス「終了」で表示される
    await page.getByRole('link', { name: '← 大会一覧' }).click();
    await page.waitForURL(/\/tournaments$/);
    await expect(page.getByTestId('tournament-row').filter({ hasText: DATA.tournament.name })).toContainText('終了');
  });
});
