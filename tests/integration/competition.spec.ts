import { expect, test } from '@playwright/test';
import { COMPETITION, createTournament, getDetail, H, loginAdmin, P, saveScores, setupTournament } from './helpers';

test.beforeEach(async ({ page }) => loginAdmin(page));

test.describe('3. 競技情報', () => {
  test('I-CMP-01 未登録時は初期値が表示され、保存できる', async ({ page }) => {
    const t = await createTournament(page.request);
    await page.goto(`/tournaments/${t.id}/competition`);
    await expect(page.getByLabel('ラウンド数')).toHaveValue('1');
    await expect(page.getByLabel('変換あり')).toBeChecked();
    await expect(page.getByLabel('ホールインワン時のスコア変換値')).toHaveValue('-2');
    await expect(page.getByLabel('パーティの最大人数')).toHaveValue('6');
    await expect(page.getByLabel('チーム戦あり')).not.toBeChecked();
    await page.getByLabel('シャッフル').check();
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByRole('status')).toHaveText('保存しました');
    await page.reload();
    await expect(page.getByLabel('シャッフル')).toBeChecked();
    expect((await getDetail(page.request, t.id)).competition).toMatchObject({
      rounds: 1,
      holeInOneConversionEnabled: true,
      holeInOneConversionValue: -2,
      maxPartySize: 6,
      partyAssignmentMethod: 'シャッフル',
      teamBattleEnabled: false,
      teamRankingMethod: null,
    });
  });

  test('I-CMP-02 全項目を変更して保存できる', async ({ page }) => {
    const t = await createTournament(page.request);
    await page.goto(`/tournaments/${t.id}/competition`);
    await page.getByLabel('ラウンド数').selectOption('2');
    await page.getByLabel('ホールインワン時のスコア変換値').selectOption('-3');
    await page.getByLabel('パーティの最大人数').selectOption('4');
    await page.getByLabel('シャッフル').check();
    await page.getByLabel('チーム戦あり').check();
    await page.getByLabel('平均').check();
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByRole('status')).toHaveText('保存しました');
    await page.reload();
    await expect(page.getByLabel('ラウンド数')).toHaveValue('2');
    await expect(page.getByLabel('ホールインワン時のスコア変換値')).toHaveValue('-3');
    await expect(page.getByLabel('パーティの最大人数')).toHaveValue('4');
    await expect(page.getByLabel('平均')).toBeChecked();
  });

  test('I-CMP-03 スコア変換値は「変換あり」にチェックがある時だけ入力できる', async ({ page }) => {
    const t = await createTournament(page.request);
    await page.goto(`/tournaments/${t.id}/competition`);
    const value = page.getByLabel('ホールインワン時のスコア変換値');
    await expect(value).toBeEnabled();
    await page.getByLabel('変換あり').uncheck();
    await expect(value).toBeDisabled();
    await page.getByLabel('変換あり').check();
    await expect(value).toBeEnabled();
    await page.getByLabel('変換あり').uncheck();
    await page.getByLabel('チーム', { exact: true }).check();
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByRole('status')).toHaveText('保存しました');
    expect((await getDetail(page.request, t.id)).competition).toMatchObject({
      holeInOneConversionEnabled: false,
      holeInOneConversionValue: null,
    });
    await page.reload();
    await expect(value).toBeDisabled();
  });

  test('I-CMP-04 チーム戦の順位決定方法は「チーム戦あり」にチェックがある時だけ選択できる', async ({ page }) => {
    const t = await createTournament(page.request);
    await page.goto(`/tournaments/${t.id}/competition`);
    await expect(page.getByLabel('合計')).toBeDisabled();
    await expect(page.getByLabel('平均')).toBeDisabled();
    await page.getByLabel('チーム戦あり').check();
    await expect(page.getByLabel('合計')).toBeEnabled();
    await expect(page.getByLabel('平均')).toBeEnabled();
    await page.getByLabel('チーム戦あり').uncheck();
    await expect(page.getByLabel('合計')).toBeDisabled();
  });

  test('I-CMP-05 必須の選択が無い場合はエラーで保存されない', async ({ page }) => {
    const t = await createTournament(page.request);
    await page.goto(`/tournaments/${t.id}/competition`);
    await page.getByLabel('チーム戦あり').check();
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('パーティの決定方法を選択してください')).toBeVisible();
    await expect(page.getByText('チーム戦の順位決定方法を選択してください')).toBeVisible();
    expect((await getDetail(page.request, t.id)).competition).toBeNull();
  });

  test('I-CMP-06 組合せ表生成後に変更すると確認ダイアログを表示し、キャンセルで変更されない', async ({ page }) => {
    const t = await setupTournament(page.request, { pairings: true });
    await page.goto(`/tournaments/${t.id}/competition`);
    await page.getByLabel('ラウンド数').selectOption('3');
    await page.getByRole('button', { name: '保存' }).click();
    const dialog = page.getByRole('dialog', { name: '組合せ表・スコア表の削除確認' });
    await expect(dialog).toContainText('既存の組合せ表・スコア表を削除し、再生成が必要になります。変更しますか？');
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    const d = await getDetail(page.request, t.id);
    expect(d.competition.rounds).toBe(1);
    expect(d.parties.length).toBeGreaterThan(0);
  });

  test('I-CMP-07 確認ダイアログで「変更する」を選ぶと保存され、組合せ表が削除される', async ({ page }) => {
    const t = await setupTournament(page.request, { pairings: true });
    await page.goto(`/tournaments/${t.id}/competition`);
    await expect(page.getByRole('button', { name: '大会を開催する' })).toBeEnabled();
    await page.getByLabel('ラウンド数').selectOption('3');
    await page.getByRole('button', { name: '保存' }).click();
    await page.getByRole('button', { name: '変更する' }).click();
    await expect(page.getByRole('status')).toContainText('組合せ表・スコア表を削除しました');
    await expect(page.getByRole('button', { name: '大会を開催する' })).toBeDisabled();
    const d = await getDetail(page.request, t.id);
    expect(d.competition.rounds).toBe(3);
    expect(d.parties).toHaveLength(0);
  });

  test('I-CMP-08 試合結果が1件でもあれば全項目が編集不可', async ({ page }) => {
    const t = await setupTournament(page.request, { players: [P('Aさん'), P('Bさん')], pairings: true });
    await saveScores(page.request, t.id, t.parties[0].partyNumber, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(30) });
    await page.goto(`/tournaments/${t.id}/competition`);
    await expect(page.getByText('試合結果が登録されているため変更できません')).toBeVisible();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    for (const label of ['ラウンド数', '変換あり', 'ホールインワン時のスコア変換値', 'パーティの最大人数', 'シャッフル', 'チーム戦あり']) {
      await expect(page.getByLabel(label), label).toBeDisabled();
    }
    const res = await page.request.put(`/api/tournaments/${t.id}/competition`, {
      data: { competition: { ...(await getDetail(page.request, t.id)).competition, rounds: 2 }, confirmReset: true },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('RESULTS_EXIST');
  });

  test('I-CMP-09 組合せ表生成後に確認なし（confirmReset=false）で変更するとAPIは409 CONFIRM_REQUIRED、同じ値での再保存は確認不要で組合せ表を保持', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { players: [P('Aさん'), P('Bさん')], pairings: true });
    const base = { ...COMPETITION };
    const ng = await r.put(`/api/tournaments/${t.id}/competition`, { data: { competition: { ...base, maxPartySize: 5 }, confirmReset: false } });
    expect(ng.status()).toBe(409);
    expect((await ng.json()).error.code).toBe('CONFIRM_REQUIRED');
    let d = await getDetail(r, t.id);
    expect(d.competition.maxPartySize).toBe(6);
    expect(d.parties).toHaveLength(1);
    // 値が変わらない保存は変更ではないため、確認不要・組合せ表も残る（試合結果があっても同様）
    expect((await r.put(`/api/tournaments/${t.id}/competition`, { data: { competition: base } })).ok()).toBe(true);
    await saveScores(r, t.id, 1, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(30) });
    expect((await r.put(`/api/tournaments/${t.id}/competition`, { data: { competition: base } })).ok()).toBe(true);
    d = await getDetail(r, t.id);
    expect(d.parties).toHaveLength(1);
    expect(d.scores).toHaveLength(2);
  });

  test('I-CMP-10 競技情報の境界値（ラウンド数1〜5・変換値-5〜1・最大人数1〜6）と、変換なし／チーム戦なしの従属項目はnullで保存', async ({ page }) => {
    const r = page.request;
    const t = await createTournament(r);
    const put = (patch: Record<string, unknown>) =>
      r.put(`/api/tournaments/${t.id}/competition`, { data: { competition: { ...COMPETITION, ...patch } } });
    for (const ok of [{ rounds: 1 }, { rounds: 5 }, { holeInOneConversionValue: -5 }, { holeInOneConversionValue: 1 }, { maxPartySize: 1 }, { maxPartySize: 6 }]) {
      expect((await put(ok)).status(), JSON.stringify(ok)).toBe(200);
    }
    const bad: [Record<string, unknown>, string][] = [
      [{ rounds: 0 }, 'rounds'],
      [{ rounds: 6 }, 'rounds'],
      [{ rounds: 1.5 }, 'rounds'],
      [{ holeInOneConversionValue: -6 }, 'holeInOneConversionValue'],
      [{ holeInOneConversionValue: 2 }, 'holeInOneConversionValue'],
      [{ maxPartySize: 0 }, 'maxPartySize'],
      [{ maxPartySize: 7 }, 'maxPartySize'],
      [{ partyAssignmentMethod: 'ランダム' }, 'partyAssignmentMethod'],
      [{ teamBattleEnabled: true, teamRankingMethod: null }, 'teamRankingMethod'],
    ];
    for (const [patch, field] of bad) {
      const res = await put(patch);
      expect(res.status(), JSON.stringify(patch)).toBe(400);
      expect(Object.keys((await res.json()).error.details), JSON.stringify(patch)).toEqual([field]);
    }
    expect((await getDetail(r, t.id)).competition.maxPartySize).toBe(6);
    // 変換なし → 変換値はnull、チーム戦なし → 順位決定方法はnull（送信値は無視）
    await put({ holeInOneConversionEnabled: false, holeInOneConversionValue: -3, teamBattleEnabled: false, teamRankingMethod: '平均' });
    expect((await getDetail(r, t.id)).competition).toMatchObject({ holeInOneConversionValue: null, teamRankingMethod: null });
  });
});
