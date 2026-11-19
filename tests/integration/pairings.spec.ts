import { expect, test, type Page } from '@playwright/test';
import { createTournament, getDetail, H, loginAdmin, P, saveScores, setupTournament } from './helpers';

test.beforeEach(async ({ page }) => loginAdmin(page));

const holeHeaders = (page: Page, partyNumber: number) =>
  page.getByTestId(`party-${partyNumber}`).getByTestId('hole-header').allTextContents();

test.describe('5. 組合せ表生成', () => {
  test('I-GEN-01 未作成の間は「大会を開催する」がdisabled、[A6]には未作成メッセージ', async ({ page }) => {
    const t = await setupTournament(page.request);
    await page.goto(`/tournaments/${t.id}`);
    await expect(page.getByRole('button', { name: '大会を開催する' })).toBeDisabled();
    await page.goto(`/tournaments/${t.id}/pairings`);
    await expect(page.getByText('まだ組合せ表が作成されていません。')).toBeVisible();
    await page.getByRole('link', { name: '大会情報画面へ戻る' }).click();
    await expect(page).toHaveURL(new RegExp(`/tournaments/${t.id}$`));
  });

  test('I-GEN-02 [A3]の「組合せ表を作成する」で生成し同画面に留まり、「大会を開催する」で[A6]へ', async ({ page }) => {
    const t = await setupTournament(page.request);
    await page.goto(`/tournaments/${t.id}`);
    await page.getByRole('button', { name: '組合せ表を作成する' }).click();
    await page.getByRole('dialog', { name: '組合せ表を作成しますか？' }).getByRole('button', { name: '作成する' }).click();
    await expect(page.getByText('組合せ表を作成しました')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/tournaments/${t.id}$`));
    await page.getByRole('button', { name: '大会を開催する' }).click();
    await expect(page).toHaveURL(new RegExp(`/tournaments/${t.id}/pairings$`));
    await expect(page.getByTestId('party-1')).toContainText('Aさん');
  });

  test('I-GEN-02b [A5]からも同じボタンで生成でき、同画面に留まる', async ({ page }) => {
    const t = await setupTournament(page.request);
    await page.goto(`/tournaments/${t.id}/players`);
    await page.getByRole('button', { name: '組合せ表を作成する' }).click();
    await page.getByRole('dialog', { name: '組合せ表を作成しますか？' }).getByRole('button', { name: '作成する', exact: true }).click();
    await expect(page.getByText('組合せ表を作成しました')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/tournaments/${t.id}/players$`));
    await page.getByRole('button', { name: '大会を開催する' }).click();
    await expect(page).toHaveURL(new RegExp(`/tournaments/${t.id}/pairings$`));
    await expect(page.getByTestId('party-1')).toContainText('Aさん');
    await expect(page.getByTestId('party-1')).toContainText('Bさん');
    await expect(page.getByTestId('party-2')).toContainText('Cさん');
  });

  test('I-GEN-03 生成条件を満たさない場合はエラーダイアログに理由を表示する', async ({ page }) => {
    const t = await setupTournament(page.request, {
      competition: { maxPartySize: 2 },
      players: [P('A'), P('B'), P('C')],
    });
    await page.goto(`/tournaments/${t.id}`);
    await page.getByRole('button', { name: '組合せ表を作成する' }).click();
    await page.getByRole('button', { name: '作成する', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'エラー' }).getByRole('alert')).toHaveText(
      'チーム『東』の人数がパーティの最大人数を超えています。選手情報またはパーティの最大人数を見直してください。',
    );
    expect((await getDetail(page.request, t.id)).parties).toHaveLength(0);
  });

  test('I-GEN-04 生成済みで再作成する場合は上書き警告を表示し、キャンセル時は変更されない', async ({ page }) => {
    const t = await setupTournament(page.request, { competition: { partyAssignmentMethod: 'シャッフル', maxPartySize: 1 }, pairings: true });
    const before = (await getDetail(page.request, t.id)).parties;
    await page.goto(`/tournaments/${t.id}`);
    await page.getByRole('button', { name: '組合せ表を作成する' }).click();
    const dialog = page.getByRole('dialog', { name: '組合せ表を作成しますか？' });
    await expect(dialog).toContainText('組合せ表は作成済みです。再作成すると現在のパーティ編成・開始ホール・スコア表は上書きされます。');
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    expect((await getDetail(page.request, t.id)).parties).toEqual(before);
  });

  test('I-GEN-05 試合結果がある場合は再生成をエラーとする', async ({ page }) => {
    const t = await setupTournament(page.request, { players: [P('Aさん'), P('Bさん')], pairings: true });
    await saveScores(page.request, t.id, 1, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(30) });
    await page.goto(`/tournaments/${t.id}`);
    await page.getByRole('button', { name: '組合せ表を作成する' }).click();
    await page.getByRole('button', { name: '作成する', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'エラー' }).getByRole('alert')).toHaveText('試合結果が入力されています。試合結果を削除して下さい。');
  });

  test('I-GEN-06 [A6]には生成・再生成の操作を設けない', async ({ page }) => {
    const t = await setupTournament(page.request, { pairings: true });
    await page.goto(`/tournaments/${t.id}/pairings`);
    await expect(page.getByTestId('party-1')).toBeVisible();
    await expect(page.getByRole('button', { name: /組合せ表を作成/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /生成/ })).toHaveCount(0);
  });

  test('I-GEN-07 開始ホールが自動割当される（9パーティ）', async ({ page }) => {
    const t = await setupTournament(page.request, {
      competition: { partyAssignmentMethod: 'シャッフル', maxPartySize: 1 },
      players: Array.from({ length: 9 }, (_, i) => P(`選手${i + 1}`)),
      pairings: true,
    });
    await page.goto(`/tournaments/${t.id}/pairings`);
    await expect(page.getByTestId('start-hole')).toHaveText(['1', '1', '2', '2', '3', '3', '4', '4', '5']);
  });

  test('I-GEN-08 シャッフルでは固定パーティの空き枠に、チーム名の違う非固定選手も入る', async ({ page }) => {
    const t = await setupTournament(page.request, {
      competition: { partyAssignmentMethod: 'シャッフル', maxPartySize: 3 },
      players: [P('Aさん', 'チームA', '1970/01/01', { partyFixed: true, partyNumber: 1 }), P('Bさん', 'チームB')],
    });
    await page.goto(`/tournaments/${t.id}`);
    await page.getByRole('button', { name: '組合せ表を作成する' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '作成する', exact: true }).click();
    await expect(page.getByRole('button', { name: '大会を開催する' })).toBeEnabled();
    await page.goto(`/tournaments/${t.id}/pairings`);
    await expect(page.locator('tbody[data-testid^="party-"]')).toHaveCount(1);
    await expect(page.getByTestId('party-1')).toContainText('Aさん');
    await expect(page.getByTestId('party-1')).toContainText('Bさん');
  });

  test('I-GEN-09 チームでは固定パーティの空き枠に収まるチームを入れ、収まらないチームは新規パーティにする', async ({ page }) => {
    const t = await setupTournament(page.request, {
      competition: { partyAssignmentMethod: 'チーム', maxPartySize: 4 },
      players: [
        P('固定さん', '本部', '1970/01/01', { partyFixed: true, partyNumber: 1 }),
        P('東1', '東'),
        P('東2', '東'),
        P('東3', '東'),
        P('西1', '西'),
        P('西2', '西'),
      ],
      pairings: true,
    });
    // 最大4・空き枠3：登録順で最初に収まる「東」（3名）がパーティ1に入り、「西」はパーティ2
    expect(t.parties.map((p: { partyNumber: number; playerIds: string[] }) => [p.partyNumber, p.playerIds.length])).toEqual([
      [1, 4],
      [2, 2],
    ]);
    await page.goto(`/tournaments/${t.id}/pairings`);
    await expect(page.getByTestId('party-1')).toContainText('固定さん');
    await expect(page.getByTestId('party-1')).toContainText('東3');
    await expect(page.getByTestId('party-2')).toContainText('西1');
  });

  test('I-GEN-10 競技情報が未登録・参加選手が2名未満（0名・1名）の場合は生成エラー', async ({ page }) => {
    const r = page.request;
    const noComp = await createTournament(r);
    await r.put(`/api/tournaments/${noComp.id}/players`, { data: { players: [P('Aさん'), P('Bさん')] } });
    const res1 = await r.post(`/api/tournaments/${noComp.id}/pairings`);
    expect(res1.status()).toBe(400);
    expect((await res1.json()).error.message).toBe('競技情報が登録されていません。競技情報を登録してください。');
    const tooFew = '参加選手数が2名未満のため組合せ表を作成できません。選手を2名以上登録してください。';
    const zero = await setupTournament(r, { players: [] });
    expect((await (await r.post(`/api/tournaments/${zero.id}/pairings`)).json()).error.message).toBe(tooFew);
    const one = await setupTournament(r, { players: [P('Aさん')] });
    await page.goto(`/tournaments/${one.id}`);
    await page.getByRole('button', { name: '組合せ表を作成する' }).click();
    await page.getByRole('button', { name: '作成する', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'エラー' }).getByRole('alert')).toHaveText(tooFew);
    expect((await getDetail(r, one.id)).parties).toHaveLength(0);
  });

  test('I-GEN-11 再生成（試合結果なし）はパーティ編成・開始ホールを一括で作り直し、手動変更した開始ホールも自動割当に戻る', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { pairings: true }); // チーム方式：東（A・B）→パーティ1、西（C）→パーティ2
    expect((await r.put(`/api/tournaments/${t.id}/pairings/2/start-hole`, { data: { startHole: 7 } })).ok()).toBe(true);
    expect((await getDetail(r, t.id)).parties.map((p: { startHole: number }) => p.startHole)).toEqual([1, 7]);
    await page.goto(`/tournaments/${t.id}`);
    await page.getByRole('button', { name: '組合せ表を作成する' }).click();
    await page.getByRole('dialog', { name: '組合せ表を作成しますか？' }).getByRole('button', { name: '作成する', exact: true }).click();
    await expect(page.getByText('組合せ表を作成しました')).toBeVisible();
    const d = await getDetail(r, t.id);
    expect(d.parties.map((p: { partyNumber: number; startHole: number }) => [p.partyNumber, p.startHole])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  test('I-GEN-12 試合結果をすべて削除すると再生成できるようになる（1件でも残っていれば再生成エラー）', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { competition: { rounds: 2 }, players: [P('Aさん'), P('Bさん')], pairings: true });
    const scores = { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(30) };
    await saveScores(r, t.id, 1, 1, scores);
    await saveScores(r, t.id, 1, 2, scores);
    const del = (round: unknown) => r.delete(`/api/tournaments/${t.id}/scores`, { data: { partyNumber: 1, round } });
    expect((await del(3)).status()).toBe(400);
    expect((await del(1)).ok()).toBe(true);
    const ng = await r.post(`/api/tournaments/${t.id}/pairings`);
    expect(ng.status()).toBe(409);
    expect((await ng.json()).error.message).toBe('試合結果が入力されています。試合結果を削除して下さい。');
    expect((await del(2)).ok()).toBe(true);
    expect((await r.post(`/api/tournaments/${t.id}/pairings`)).status()).toBe(201);
    expect((await getDetail(r, t.id)).scores).toHaveLength(0);
  });
});

test.describe('6. 組合せ・スコア表', () => {
  test('I-SCR-01 表の操作列の表題は「スコア入力」、年齢は「◯歳◯日」で表示', async ({ page }) => {
    const t = await setupTournament(page.request, { pairings: true });
    await page.goto(`/tournaments/${t.id}/pairings`);
    const headers = await page.locator('thead th').allTextContents();
    expect(headers).toContain('スコア入力');
    expect(headers).not.toContain('操作');
    // 年齢は開催日（2026/11/16）基準の「◯歳◯日」形式（1970/01/01生 → 56歳319日）
    await expect(page.getByTestId('party-1')).toContainText('56歳319日');
  });

  test('I-SCR-02/03 ホール列は開始ホールに関わらず1〜8の固定順で表示し、開始ホールの手動変更が反映される', async ({ page }) => {
    const t = await setupTournament(page.request, { pairings: true });
    await page.goto(`/tournaments/${t.id}/pairings`);
    await expect(page.getByTestId('party-2').getByTestId('start-hole')).toHaveText('2');
    expect(await holeHeaders(page, 2)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    await page.getByTestId('party-2').getByRole('button', { name: '変更' }).click();
    const dialog = page.getByRole('dialog', { name: 'パーティ2 の開始ホール変更' });
    await dialog.getByLabel('開始ホール').selectOption('5');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByTestId('party-2').getByTestId('start-hole')).toHaveText('5');
    await expect(page.getByTestId('party-2').getByTestId('hole-header')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect((await getDetail(page.request, t.id)).parties[1].startHole).toBe(5);
  });

  test('I-SCR-04/05 スコア入力は8ホール一括・初期値1、保存で入力済・小計・合計、ホールインワンは変換値で集計', async ({ page }) => {
    const t = await setupTournament(page.request, { players: [P('Aさん'), P('Bさん')], pairings: true });
    await page.goto(`/tournaments/${t.id}/pairings`);
    await page.getByTestId('party-1').getByRole('button', { name: /ラウンド1：\s*未入力/ }).click();
    const dialog = page.getByRole('dialog', { name: 'パーティ1 ラウンド1 スコア入力' });
    const inputs = dialog.getByRole('spinbutton');
    await expect(inputs).toHaveCount(16);
    for (let i = 0; i < 16; i++) await expect(inputs.nth(i)).toHaveValue('1');
    // Aさん：ホール1がホールインワン、他は3 → 小計 -2+21=19。Bさん：全て4 → 32
    for (let h = 2; h <= 8; h++) await dialog.getByLabel(`Aさん ホール${h}`).fill('3');
    for (let h = 1; h <= 8; h++) await dialog.getByLabel(`Bさん ホール${h}`).fill('4');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('party-1').getByRole('button', { name: /ラウンド1：\s*入力済/ })).toBeVisible();
    const rowA = page.getByTestId('row-Aさん-1');
    await expect(rowA.getByTestId('hole-cell').first()).toHaveText('1(-2)');
    await expect(rowA.getByTestId('subtotal')).toHaveText('19');
    await expect(rowA.getByTestId('total')).toHaveText('19');
    await expect(page.getByTestId('row-Bさん-1').getByTestId('subtotal')).toHaveText('32');
  });

  test('I-SCR-04b スコア入力ダイアログの入力欄は開始ホールに関わらずホール1から順に並ぶ', async ({ page }) => {
    const t = await setupTournament(page.request, { pairings: true });
    await page.goto(`/tournaments/${t.id}/pairings`);
    // パーティ2の開始ホールは2（表のホール列も1〜8の固定順）
    await expect(page.getByTestId('party-2').getByTestId('start-hole')).toHaveText('2');
    expect(await holeHeaders(page, 2)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    await page.getByTestId('party-2').getByRole('button', { name: /ラウンド1：\s*未入力/ }).click();
    const dialog = page.getByRole('dialog', { name: 'パーティ2 ラウンド1 スコア入力' });
    const headers = (await dialog.locator('thead th').allTextContents()).slice(1);
    expect(headers).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    const name = (await dialog.locator('tbody tr').first().locator('td').first().textContent()) ?? '';
    const labels = await dialog
      .locator('tbody tr')
      .first()
      .getByRole('spinbutton')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(labels).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((h) => `${name} ホール${h}`));
  });

  test('I-SCR-05b 競技情報が「変換なし」の場合、打数1はそのまま表示・集計される', async ({ page }) => {
    const t = await setupTournament(page.request, {
      competition: { holeInOneConversionEnabled: false, holeInOneConversionValue: null },
      players: [P('Aさん'), P('Bさん')],
      pairings: true,
    });
    await saveScores(page.request, t.id, 1, 1, { [t.byName['Aさん']]: [1, 3, 3, 3, 3, 3, 3, 3], [t.byName['Bさん']]: H(30) });
    await page.goto(`/tournaments/${t.id}/pairings`);
    const rowA = page.getByTestId('row-Aさん-1');
    await expect(rowA.getByTestId('hole-cell').first()).toHaveText('1');
    await expect(rowA.getByTestId('subtotal')).toHaveText('22');
  });

  test('I-SCR-06 登録済みスコアを修正できる', async ({ page }) => {
    const t = await setupTournament(page.request, { players: [P('Aさん'), P('Bさん')], pairings: true });
    await saveScores(page.request, t.id, 1, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(30) });
    await page.goto(`/tournaments/${t.id}/pairings`);
    await page.getByRole('button', { name: /ラウンド1：\s*入力済/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Aさん ホール1')).toHaveValue('16');
    await dialog.getByLabel('Aさん ホール1').fill('6');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByTestId('row-Aさん-1').getByTestId('subtotal')).toHaveText('20');
  });

  test('I-SCR-07 範囲外の打数はエラーで保存されない', async ({ page }) => {
    const t = await setupTournament(page.request, { players: [P('Aさん'), P('Bさん')], pairings: true });
    await page.goto(`/tournaments/${t.id}/pairings`);
    await page.getByRole('button', { name: /ラウンド1：\s*未入力/ }).click();
    const dialog = page.getByRole('dialog');
    for (const bad of ['0', '100', '']) {
      await dialog.getByLabel('Aさん ホール1').fill(bad);
      await dialog.getByRole('button', { name: '保存' }).click();
      await expect(dialog.getByText('打数は1〜99の整数で入力してください')).toBeVisible();
    }
    expect((await getDetail(page.request, t.id)).scores).toHaveLength(0);
  });

  test('I-SCR-08 保存済みラウンドのスコアを削除して未入力に戻せる', async ({ page }) => {
    const t = await setupTournament(page.request, { players: [P('Aさん'), P('Bさん')], pairings: true });
    await saveScores(page.request, t.id, 1, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(30) });
    await page.goto(`/tournaments/${t.id}/pairings`);
    await page.getByRole('button', { name: /ラウンド1：\s*入力済/ }).click();
    await page.getByRole('button', { name: 'このラウンドのスコアを削除' }).click();
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(page.getByRole('button', { name: /ラウンド1：\s*未入力/ })).toBeVisible();
    await expect(page.getByTestId('row-Aさん-1').getByTestId('subtotal')).toHaveText('ー');
    expect((await getDetail(page.request, t.id)).scores).toHaveLength(0);
  });

  test('I-SCR-09 複数ラウンドでは合計は入力済ラウンドのみを合算する', async ({ page }) => {
    const t = await setupTournament(page.request, { competition: { rounds: 2 }, players: [P('Aさん'), P('Bさん')], pairings: true });
    await saveScores(page.request, t.id, 1, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(31) });
    await page.goto(`/tournaments/${t.id}/pairings`);
    await expect(page.getByRole('button', { name: /ラウンド2：\s*未入力/ })).toBeVisible();
    await expect(page.getByTestId('row-Aさん-2').getByTestId('subtotal')).toHaveText('ー');
    await expect(page.getByTestId('row-Aさん-1').getByTestId('total')).toHaveText('30');
  });

  test('I-SCR-10 パーティ内の一部選手だけのスコア保存はAPIで拒否される', async ({ page }) => {
    const t = await setupTournament(page.request, { players: [P('Aさん'), P('Bさん')], pairings: true });
    const res = await page.request.put(`/api/tournaments/${t.id}/scores`, {
      data: { partyNumber: 1, round: 1, scores: { [t.byName['Aさん']]: H(30) } },
    });
    expect(res.status()).toBe(400);
  });

  test('I-SCR-11/12/13 開始グループの表示、見出しクリックでの並べ替え、同じ開始グループで使用中の開始ホールは選択不可', async ({ page }) => {
    // 最大1人・9名 → 9パーティ。開始ホールは商2で 1,1,2,2,3,3,4,4,5。パーティ9を開始ホール8へ変更
    const t = await setupTournament(page.request, {
      competition: { partyAssignmentMethod: 'シャッフル', maxPartySize: 1 },
      players: Array.from({ length: 9 }, (_, i) => P(`選手${i + 1}`)),
      pairings: true,
    });
    const res = await page.request.put(`/api/tournaments/${t.id}/pairings/9/start-hole`, { data: { startHole: 8 } });
    expect(res.ok()).toBe(true);
    await page.goto(`/tournaments/${t.id}/pairings`);
    const order = async () =>
      (await page.locator('tbody[data-testid^="party-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).map(
        (x) => Number(x?.replace('party-', '')),
      );
    expect(await order()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // I-SCR-12 開始グループ：同じ開始ホール内でパーティ番号順に1,2。列はパーティ番号と開始ホールの間
    await expect(page.getByTestId('start-group')).toHaveText(['1', '2', '1', '2', '1', '2', '1', '2', '1']);
    const heads = await page.locator('thead th').allTextContents();
    const at = (s: string) => heads.findIndex((h) => h.includes(s));
    expect(at('パーティ番号') + 1).toBe(at('開始グループ'));
    expect(at('開始グループ') + 1).toBe(at('開始ホール'));

    // I-SCR-11 並べ替え（昇順 → 降順 → 解除）
    const startGroup = page.getByRole('button', { name: /開始グループ/ });
    await startGroup.click(); // 昇順（同じ開始グループは開始ホール順）
    expect(await order()).toEqual([1, 3, 5, 7, 9, 2, 4, 6, 8]);
    await expect(page.locator('th[aria-sort="ascending"]')).toContainText('開始グループ');
    await startGroup.click(); // 降順
    expect(await order()).toEqual([2, 4, 6, 8, 1, 3, 5, 7, 9]);
    await startGroup.click(); // 解除 → パーティ番号順
    expect(await order()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const startHole = page.getByRole('button', { name: /開始ホール/ });
    await startHole.click(); // 昇順（同じ開始ホールはパーティ番号順）
    expect(await order()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await startHole.click(); // 降順
    expect(await order()).toEqual([9, 7, 8, 5, 6, 3, 4, 1, 2]);
    await startHole.click(); // 解除

    const partyNumber = page.getByRole('button', { name: /パーティ番号/ });
    await partyNumber.click(); // 昇順
    expect(await order()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await partyNumber.click(); // 降順
    expect(await order()).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    await partyNumber.click(); // 解除

    // I-SCR-13 パーティ2（開始グループ2・ホール1）：開始グループ2のパーティ4・6・8が使うホール2・3・4は選択不可
    await page.getByTestId('party-2').getByRole('button', { name: '変更' }).click();
    const dialog = page.getByRole('dialog', { name: 'パーティ2 の開始ホール変更' });
    const disabled = await dialog
      .locator('option')
      .evaluateAll((els) => els.filter((e) => (e as HTMLOptionElement).disabled).map((e) => (e as HTMLOptionElement).value));
    expect(disabled).toEqual(['2', '3', '4']);
    await expect(dialog.locator('option[value="3"]')).toHaveText('3（同じ開始グループのパーティ6が使用中）');
    await dialog.getByLabel('開始ホール').selectOption('5');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByTestId('party-2').getByTestId('start-hole')).toHaveText('5');
    // APIでも拒否される（パーティ4は開始グループ2、ホール3はパーティ6が使用中）
    const ng = await page.request.put(`/api/tournaments/${t.id}/pairings/4/start-hole`, { data: { startHole: 3 } });
    expect(ng.status()).toBe(400);
  });

  test('I-SCR-14 開始ホール変更の選択制限：開始グループ1の単独パーティは他の開始グループ1が使うホールを選べない。変更後は開始グループが付け直される', async ({ page }) => {
    // 9パーティ：開始ホール 1,1,2,2,3,3,4,4,5（パーティ9は開始ホール5・開始グループ1）
    const t = await setupTournament(page.request, {
      competition: { partyAssignmentMethod: 'シャッフル', maxPartySize: 1 },
      players: Array.from({ length: 9 }, (_, i) => P(`選手${i + 1}`)),
      pairings: true,
    });
    await page.goto(`/tournaments/${t.id}/pairings`);
    await page.getByTestId('party-9').getByRole('button', { name: '変更' }).click();
    let dialog = page.getByRole('dialog', { name: 'パーティ9 の開始ホール変更' });
    const disabledOptions = () =>
      dialog.locator('option').evaluateAll((els) => els.filter((e) => (e as HTMLOptionElement).disabled).map((e) => (e as HTMLOptionElement).value));
    expect(await disabledOptions()).toEqual(['1', '2', '3', '4']);
    await expect(dialog.locator('option[value="1"]')).toHaveText('1（同じ開始グループのパーティ1が使用中）');
    await dialog.getByLabel('開始ホール').selectOption('6');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByTestId('party-9').getByTestId('start-hole')).toHaveText('6');

    // パーティ2（開始グループ2・ホール1）をホール6へ：ホール6はパーティ9（開始グループ1）のみのため選択可。
    // 変更後はホール6内でパーティ番号順に付け直され、パーティ2が開始グループ1、パーティ9が開始グループ2になる
    await page.getByTestId('party-2').getByRole('button', { name: '変更' }).click();
    dialog = page.getByRole('dialog', { name: 'パーティ2 の開始ホール変更' });
    expect(await disabledOptions()).toEqual(['2', '3', '4']);
    await dialog.getByLabel('開始ホール').selectOption('6');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByTestId('party-2').getByTestId('start-hole')).toHaveText('6');
    await expect(page.getByTestId('party-2').getByTestId('start-group')).toHaveText('1');
    await expect(page.getByTestId('party-9').getByTestId('start-group')).toHaveText('2');
    await expect(page.getByTestId('party-1').getByTestId('start-group')).toHaveText('1');

    // API：現在と同じ開始ホールは指定可、範囲外・整数以外は400、存在しないパーティは404
    const put = (party: number | string, startHole: unknown) =>
      page.request.put(`/api/tournaments/${t.id}/pairings/${party}/start-hole`, { data: { startHole } });
    expect((await put(5, 3)).status()).toBe(200);
    for (const bad of [0, 9, 2.5, '3', null]) expect((await put(1, bad)).status(), String(bad)).toBe(400);
    expect((await put(10, 1)).status()).toBe(404);
    expect((await put('abc', 1)).status()).toBe(404);
  });

  test('I-SCR-15 スコア保存APIの境界値：打数1〜99・8ホール・ラウンド1〜ラウンド数、パーティ外の選手・存在しないパーティは拒否', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { competition: { rounds: 2 }, players: [P('Aさん'), P('Bさん'), P('Cさん', '西')], pairings: true });
    const east = t.parties.find((p) => p.playerIds.includes(t.byName['Aさん']))!;
    const a = t.byName['Aさん'];
    const b = t.byName['Bさん'];
    const put = (data: Record<string, unknown>) => r.put(`/api/tournaments/${t.id}/scores`, { data });
    const body = (scores: Record<string, unknown>, round = 1, partyNumber = east.partyNumber) => ({ partyNumber, round, scores });
    expect((await put(body({ [a]: Array(8).fill(1), [b]: Array(8).fill(99) }))).status()).toBe(200);
    expect((await put(body({ [a]: H(30), [b]: H(30) }, 2))).status()).toBe(200);
    const bad: [string, Record<string, unknown>][] = [
      ['打数0', body({ [a]: [0, 2, 2, 2, 2, 2, 2, 2], [b]: H(30) })],
      ['打数100', body({ [a]: [100, 2, 2, 2, 2, 2, 2, 2], [b]: H(30) })],
      ['小数', body({ [a]: [2.5, 2, 2, 2, 2, 2, 2, 2], [b]: H(30) })],
      ['7ホール', body({ [a]: [2, 2, 2, 2, 2, 2, 2], [b]: H(30) })],
      ['9ホール', body({ [a]: [2, 2, 2, 2, 2, 2, 2, 2, 2], [b]: H(30) })],
      ['ラウンド0', body({ [a]: H(30), [b]: H(30) }, 0)],
      ['ラウンド3（ラウンド数2）', body({ [a]: H(30), [b]: H(30) }, 3)],
      ['パーティ外の選手', body({ [a]: H(30), [t.byName['Cさん']]: H(30) })],
      ['余分な選手', body({ [a]: H(30), [b]: H(30), [t.byName['Cさん']]: H(30) })],
    ];
    for (const [label, data] of bad) {
      const res = await put(data);
      expect(res.status(), label).toBe(400);
      expect((await res.json()).error.code, label).toBe('VALIDATION_ERROR');
    }
    expect((await put(body({ [a]: H(30), [b]: H(30) }, 1, 99))).status()).toBe(404);
    // 拒否された保存で既存のスコアは変わらない
    const d = await getDetail(r, t.id);
    expect(d.scores.find((s: { playerId: string; round: number }) => s.playerId === a && s.round === 1).holes).toEqual(Array(8).fill(1));
    expect(d.scores).toHaveLength(4);
  });

  test('I-SCR-16 [A3]で開催日を変更すると、[A6]の年齢は新しい開催日を基準に再計算される', async ({ page }) => {
    const t = await setupTournament(page.request, { players: [P('Aさん', '東', '1960/11/17'), P('Bさん')], pairings: true });
    await page.goto(`/tournaments/${t.id}/pairings`);
    await expect(page.getByTestId('row-Aさん-1')).toContainText('65歳364日'); // 開催日2026/11/16
    await page.goto(`/tournaments/${t.id}`);
    await page.getByLabel(/開催日/).fill('2026-11-17');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByRole('status')).toHaveText('保存しました');
    await page.getByRole('button', { name: '大会を開催する' }).click();
    await expect(page).toHaveURL(/\/pairings$/);
    await expect(page.getByTestId('row-Aさん-1')).toContainText('66歳0日');
  });
});
