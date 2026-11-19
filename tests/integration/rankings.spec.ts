import { expect, test } from '@playwright/test';
import { getDetail, H, loginAdmin, P, saveScores, setupTournament } from './helpers';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => loginAdmin(page));

const individualRows = (page: import('@playwright/test').Page) =>
  page.getByTestId('individual-row').evaluateAll((rows) =>
    rows.map((r) => Array.from(r.querySelectorAll('td')).slice(0, 4).map((td) => td.textContent ?? '')),
  );

test.describe('8. 順位表', () => {
  test('I-RNK-01/08/09 個人戦の総合順位表（トータルスコア小→年齢上）・チーム戦なし・決定方法の表記', async ({ page }) => {
    const t = await setupTournament(page.request, {
      competition: { partyAssignmentMethod: 'シャッフル', maxPartySize: 6 },
      players: [P('Aさん', '', '1985/03/10'), P('Bさん', '', '1971/05/24'), P('Cさん', '', '1990/01/01'), P('Dさん', '', '1960/01/01')],
      pairings: true,
    });
    const pid = (n: string) => t.byName[n];
    // シャッフル・最大6人のため4名とも1パーティ
    const party = t.parties[0];
    const scores: Record<string, number[]> = { [pid('Aさん')]: H(30), [pid('Bさん')]: H(30), [pid('Cさん')]: H(28), [pid('Dさん')]: H(40) };
    await saveScores(page.request, t.id, party.partyNumber, 1, scores);
    await page.goto(`/tournaments/${t.id}/rankings`);
    await expect(page.getByText('「順位表作成」ボタンを押すと、その時点のスコアを集計して表示します。')).toBeVisible();
    await page.getByRole('button', { name: '順位表作成' }).click();
    await expect(page.getByTestId('individual-row')).toHaveCount(4);
    expect(await individualRows(page)).toEqual([
      ['1', 'Cさん', '-', '28'],
      ['2', 'Bさん', '-', '30'],
      ['3', 'Aさん', '-', '30'],
      ['4', 'Dさん', '-', '40'],
    ]);
    await expect(page.getByText('1. トータルスコアが小さい　2. 年齢が上　3. じゃんけん')).toBeVisible();
    // 生年月日ではなく年齢（「◯歳◯日」）を表示する
    const header = page.getByTestId('individual-ranking').locator('thead');
    await expect(header).toContainText('年齢');
    await expect(header).not.toContainText('生年月日');
    const ages = await page.getByTestId('individual-row').evaluateAll((rows) => rows.map((r) => r.querySelectorAll('td')[4]?.textContent ?? ''));
    for (const a of ages) expect(a).toMatch(/^\d+歳\d+日$/);
    await expect(page.getByTestId('team-ranking')).toHaveCount(0); // I-RNK-08 チーム戦なし
  });

  test('I-RNK-02 全ラウンド分のスコアが保存されていない選手は除外され注記される', async ({ page }) => {
    const t = await setupTournament(page.request, {
      competition: { rounds: 2 },
      players: [P('Aさん'), P('Bさん'), P('Cさん', '西')],
      pairings: true,
    });
    const east = t.parties.find((p) => p.playerIds.includes(t.byName['Aさん']))!;
    await saveScores(page.request, t.id, east.partyNumber, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(31) });
    await saveScores(page.request, t.id, east.partyNumber, 2, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(31) });
    const west = t.parties.find((p) => p.playerIds.includes(t.byName['Cさん']))!;
    await saveScores(page.request, t.id, west.partyNumber, 1, { [t.byName['Cさん']]: H(20) });
    await page.goto(`/tournaments/${t.id}/rankings`);
    await page.getByRole('button', { name: '順位表作成' }).click();
    await expect(page.getByTestId('individual-row')).toHaveCount(2);
    await expect(page.getByTestId('excluded')).toHaveText('全ラウンド分のスコアが保存されていないため集計対象外：Cさん');
  });

  test('I-RNK-03 スコアを修正しても順位表は自動更新されず、再作成で反映される', async ({ page }) => {
    const t = await setupTournament(page.request, { players: [P('Aさん'), P('Bさん')], pairings: true });
    await saveScores(page.request, t.id, 1, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(31) });
    await page.goto(`/tournaments/${t.id}/rankings`);
    await page.getByRole('button', { name: '順位表作成' }).click();
    await expect(page.getByTestId('individual-row').first()).toContainText('Aさん');
    // [A6]でスコアを修正
    await page.getByRole('link', { name: '組合せ・スコア表' }).click();
    await page.getByRole('button', { name: /ラウンド1：\s*入力済/ }).click();
    await page.getByRole('dialog').getByLabel('Bさん ホール1').fill('2');
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click();
    await expect(page.getByTestId('row-Bさん-1').getByTestId('subtotal')).toHaveText('16');
    await page.getByRole('link', { name: '順位表' }).click();
    await expect(page.getByTestId('individual-row').first()).toContainText('Aさん');
    await page.getByRole('button', { name: '順位表作成' }).click();
    await expect(page.getByTestId('individual-row').first()).toContainText('Bさん');
  });

  test('I-RNK-04/05 じゃんけん待ちを手動確定でき、範囲外はエラー', async ({ page }) => {
    const t = await setupTournament(page.request, { players: [P('Aさん'), P('Bさん'), P('Cさん')], pairings: true });
    await saveScores(page.request, t.id, 1, 1, { [t.byName['Aさん']]: H(25), [t.byName['Bさん']]: H(30), [t.byName['Cさん']]: H(30) });
    await page.goto(`/tournaments/${t.id}/rankings`);
    await page.getByRole('button', { name: '順位表作成' }).click();
    await expect(page.getByText('じゃんけん待ち')).toHaveCount(2);
    const rowC = page.getByTestId('individual-row').filter({ hasText: 'Cさん' });
    await rowC.getByRole('button', { name: '手動確定' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cさん の最終順位を手動確定' });
    await expect(dialog).toContainText('確定する順位（2〜3）');
    await dialog.getByLabel('確定する順位').fill('4');
    await dialog.getByRole('button', { name: '確定する' }).click();
    await expect(dialog.getByText('確定する順位は2〜3の範囲で入力してください')).toBeVisible();
    await dialog.getByLabel('確定する順位').fill('2');
    await dialog.getByRole('button', { name: '確定する' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByTestId('individual-row').filter({ hasText: 'Bさん' }).getByRole('button', { name: '手動確定' }).click();
    await page.getByRole('dialog').getByLabel('確定する順位').fill('3');
    await page.getByRole('dialog').getByRole('button', { name: '確定する' }).click();
    await expect(page.getByText('じゃんけん待ち')).toHaveCount(0);
    expect((await individualRows(page)).map((r) => [r[0], r[1]])).toEqual([
      ['1', 'Aさん'],
      ['2', 'Cさん'],
      ['3', 'Bさん'],
    ]);
  });

  test('I-RNK-06 チーム戦（平均）：平均スコアが小さい順、同点は合計年齢が上', async ({ page }) => {
    const t = await setupTournament(page.request, {
      competition: { partyAssignmentMethod: 'シャッフル', teamBattleEnabled: true, teamRankingMethod: '平均' },
      players: [
        P('東1', '東', '1950/01/01'),
        P('東2', '東', '1950/01/01'),
        P('西1', '西', '1990/01/01'),
        P('南1', '南', '1980/01/01'),
        P('南2', '南', '1980/01/01'),
      ],
      pairings: true,
    });
    const scores: Record<string, number[]> = {
      [t.byName['東1']]: H(30), [t.byName['東2']]: H(32), // 平均31
      [t.byName['西1']]: H(30), // 平均30
      [t.byName['南1']]: H(31), [t.byName['南2']]: H(31), // 平均31（東より若い）
    };
    await saveScores(page.request, t.id, t.parties[0].partyNumber, 1, scores);
    await page.goto(`/tournaments/${t.id}/rankings`);
    await page.getByRole('button', { name: '順位表作成' }).click();
    await expect(page.getByRole('heading', { name: 'チーム戦 総合順位表（平均）' })).toBeVisible();
    await expect(page.getByText('1. チームの平均スコアが小さい　2. チームの合計年齢が上　3. じゃんけん')).toBeVisible();
    const rows = await page.getByTestId('team-row').evaluateAll((rs) =>
      rs.map((r) => Array.from(r.querySelectorAll('td')).slice(0, 5).map((td) => td.textContent)),
    );
    // 開催日2026/11/16時点：1950/01/01生＝76歳319日、1980/01/01生＝46歳319日、1990/01/01生＝36歳319日
    expect(rows).toEqual([
      ['1', '西', '1', '30', '36歳319日'],
      ['2', '東', '2', '31', '152歳638日'],
      ['3', '南', '2', '31', '92歳638日'],
    ]);
  });

  test('I-RNK-07 チーム戦（合計）：合計スコアが小さい順', async ({ page }) => {
    const t = await setupTournament(page.request, {
      competition: { partyAssignmentMethod: 'シャッフル', teamBattleEnabled: true, teamRankingMethod: '合計' },
      players: [P('東1', '東'), P('東2', '東'), P('西1', '西')],
      pairings: true,
    });
    await saveScores(page.request, t.id, t.parties[0].partyNumber, 1, {
      [t.byName['東1']]: H(20), [t.byName['東2']]: H(20), [t.byName['西1']]: H(30),
    });
    await page.goto(`/tournaments/${t.id}/rankings`);
    await page.getByRole('button', { name: '順位表作成' }).click();
    await expect(page.getByRole('heading', { name: 'チーム戦 総合順位表（合計）' })).toBeVisible();
    await expect(page.getByText('1. チームの合計スコアが小さい　2. チームの合計年齢が上　3. じゃんけん')).toBeVisible();
    await expect(page.getByTestId('team-row').nth(0)).toContainText('西');
    await expect(page.getByTestId('team-row').nth(1)).toContainText('東');
  });

  test('I-RNK-10 終了した大会では順位表作成・手動確定ができない（ボタンはdisabled、APIは409）、作成済みの順位表は閲覧でき、再開すると再び操作できる', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { players: [P('Aさん'), P('Bさん')], pairings: true });
    await saveScores(r, t.id, 1, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(30) });
    await r.post(`/api/tournaments/${t.id}/rankings`);
    await r.put(`/api/tournaments/${t.id}/status`, { data: { status: '終了' } });
    await page.goto(`/tournaments/${t.id}`);
    await page.getByRole('button', { name: '大会を閲覧する' }).click();
    await page.getByRole('link', { name: '順位表' }).click();
    await expect(page.getByText('大会が終了しているため変更できません')).toBeVisible();
    await expect(page.getByRole('button', { name: '順位表作成' })).toBeDisabled();
    await expect(page.getByText('じゃんけん待ち')).toHaveCount(2);
    const confirmButtons = page.getByRole('button', { name: '手動確定' });
    await expect(confirmButtons).toHaveCount(2);
    for (const b of await confirmButtons.all()) await expect(b).toBeDisabled();
    const before = (await getDetail(r, t.id)).ranking;
    const gen = await r.post(`/api/tournaments/${t.id}/rankings`);
    expect(gen.status()).toBe(409);
    expect((await gen.json()).error.code).toBe('TOURNAMENT_FINISHED');
    const manual = await r.put(`/api/tournaments/${t.id}/rankings/manual`, {
      data: { target: { kind: 'individual', playerId: t.byName['Bさん'] }, rank: 1 },
    });
    expect(manual.status()).toBe(409);
    expect((await manual.json()).error.code).toBe('TOURNAMENT_FINISHED');
    expect((await getDetail(r, t.id)).ranking).toEqual(before);
    // 再開すると再び手動確定できる
    await r.put(`/api/tournaments/${t.id}/status`, { data: { status: '進行中' } });
    await page.reload();
    await expect(page.getByRole('button', { name: '順位表作成' })).toBeEnabled();
    await page.getByTestId('individual-row').filter({ hasText: 'Bさん' }).getByRole('button', { name: '手動確定' }).click();
    await page.getByRole('dialog').getByLabel('確定する順位').fill('1');
    await page.getByRole('dialog').getByRole('button', { name: '確定する' }).click();
    await expect(page.getByText('じゃんけん待ち')).toHaveCount(1);
  });

  test('I-RNK-11 [A6][A7]のタイトル行は大会情報同様、大会名・状態の行と開催日・開催場所の行に分けて表示する', async ({ page }) => {
    const t = await setupTournament(page.request, { pairings: true });
    for (const path of ['pairings', 'rankings']) {
      await page.goto(`/tournaments/${t.id}/${path}`);
      await expectTitleOnTwoLines(page, t.name);
    }
    // 比較対象の[A3]も同じ構成であること
    await page.goto(`/tournaments/${t.id}`);
    await expectTitleOnTwoLines(page, t.name);
  });

  test('I-RNK-12 手動確定後にスコアを保存（修正）して順位表作成を再実行すると、手動確定は引き継がれず再びじゃんけん待ちに戻る', async ({ page }) => {
    const t = await setupTournament(page.request, { players: [P('Aさん'), P('Bさん')], pairings: true });
    const scores = { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(30) };
    await saveScores(page.request, t.id, 1, 1, scores);
    await page.goto(`/tournaments/${t.id}/rankings`);
    await page.getByRole('button', { name: '順位表作成' }).click();
    await page.getByTestId('individual-row').filter({ hasText: 'Bさん' }).getByRole('button', { name: '手動確定' }).click();
    await page.getByRole('dialog').getByLabel('確定する順位').fill('1');
    await page.getByRole('dialog').getByRole('button', { name: '確定する' }).click();
    await expect(page.getByText('じゃんけん待ち')).toHaveCount(1);
    // 再読込しても手動確定の結果（順位表）は保持される
    await page.reload();
    await expect(page.getByText('じゃんけん待ち')).toHaveCount(1);
    await expect(page.getByTestId('individual-row').first()).toContainText('Bさん');
    // 同じ打数で保存し直し（タイ条件は解消しない）→ 再作成でじゃんけん待ちに戻る
    await saveScores(page.request, t.id, 1, 1, scores);
    await page.getByRole('button', { name: '順位表作成' }).click();
    await expect(page.getByText('じゃんけん待ち')).toHaveCount(2);
  });

  test('I-RNK-13 手動確定APIの拒否：順位表未作成は404、じゃんけん待ちでない行・存在しない対象・チーム戦なしのチーム指定は400', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { players: [P('Aさん'), P('Bさん')], pairings: true });
    const manual = (target: Record<string, unknown>, rank: unknown) =>
      r.put(`/api/tournaments/${t.id}/rankings/manual`, { data: { target, rank } });
    expect((await manual({ kind: 'individual', playerId: t.byName['Aさん'] }, 1)).status()).toBe(404);
    await saveScores(r, t.id, 1, 1, { [t.byName['Aさん']]: H(29), [t.byName['Bさん']]: H(30) });
    expect((await r.post(`/api/tournaments/${t.id}/rankings`)).status()).toBe(201);
    const cases: [string, Record<string, unknown>, unknown][] = [
      ['じゃんけん待ちでない', { kind: 'individual', playerId: t.byName['Aさん'] }, 1],
      ['存在しない選手', { kind: 'individual', playerId: 'unknown' }, 1],
      ['チーム戦なし', { kind: 'team', teamName: '東' }, 1],
      ['対象の形式違い', { kind: 'other' }, 1],
    ];
    for (const [label, target, rank] of cases) {
      const res = await manual(target, rank);
      expect(res.status(), label).toBe(400);
    }
  });
});

async function expectTitleOnTwoLines(page: Page, name: string) {
  const title = page.getByRole('heading', { level: 1, name });
  await expect(title).toBeVisible();
  const datePlace = page.getByText(/^\d{4}\/\d{2}\/\d{2}・/);
  await expect(datePlace).toBeVisible();
  const a = await title.boundingBox();
  const b = await datePlace.boundingBox();
  expect(a && b && b.y >= a.y + a.height - 1).toBe(true);
}
