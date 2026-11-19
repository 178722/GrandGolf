import { expect, test } from '@playwright/test';
import { getDetail, H, loginAdmin, P, setupTournament } from './helpers';

test.beforeEach(async ({ page }) => loginAdmin(page));

const FINISHED = '大会が終了しているため変更できません';

test.describe('7. 大会ステータス', () => {
  test('I-ST-01 「大会を終了する」で「終了」になり、一覧・ボタン構成に反映される（組合せ表を作成する・大会を開催するはdisabledで表示）', async ({ page }) => {
    const t = await setupTournament(page.request, { pairings: true });
    await page.goto(`/tournaments/${t.id}`);
    await page.getByRole('button', { name: '大会を終了する' }).click();
    const dialog = page.getByRole('dialog', { name: '大会を終了しますか？' });
    await expect(dialog).toContainText(
      '大会を終了すると、大会情報・競技情報・選手情報の編集、スコアの入力・修正、順位表の作成、順位の手動確定（じゃんけん結果の確定）ができなくなります。',
    );
    await dialog.getByRole('button', { name: '終了する', exact: true }).click();
    await expect(page.getByText('終了', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '大会を閲覧する' })).toBeVisible();
    await expect(page.getByRole('button', { name: '大会を再開する' })).toBeVisible();
    for (const name of ['組合せ表を作成する', '大会を開催する']) {
      await expect(page.getByRole('button', { name }), name).toBeVisible();
      await expect(page.getByRole('button', { name }), name).toBeDisabled();
    }
    await expect(page.getByRole('button', { name: '大会を再開する' })).toBeEnabled();
    await page.goto('/tournaments');
    await expect(page.getByTestId('tournament-row').filter({ hasText: t.name })).toContainText('終了');
  });

  test('I-ST-02 終了中は[A3][A4][A5]の編集が一切できない（保存・キャンセル等のボタンはdisabledで表示）', async ({ page }) => {
    const t = await setupTournament(page.request);
    await page.request.put(`/api/tournaments/${t.id}/status`, { data: { status: '終了' } });
    await page.goto(`/tournaments/${t.id}`);
    await expect(page.getByLabel(/大会名/)).toBeDisabled();
    for (const name of ['保存', 'キャンセル']) {
      await expect(page.getByRole('button', { name, exact: true }), name).toBeVisible();
      await expect(page.getByRole('button', { name, exact: true }), name).toBeDisabled();
    }
    await expect(page.getByText(FINISHED)).toBeVisible();
    await page.goto(`/tournaments/${t.id}/competition`);
    await expect(page.getByLabel('ラウンド数')).toBeDisabled();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    await expect(page.getByText(FINISHED)).toBeVisible();
    await page.goto(`/tournaments/${t.id}/players`);
    await expect(page.getByRole('button', { name: '+ 新規登録' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '編集' }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: '削除' }).first()).toBeDisabled();
    await expect(page.getByText(FINISHED)).toBeVisible();
  });

  test('I-ST-03 終了大会の組合せ・スコア表では開始ホールの変更・スコアの入力ができない', async ({ page }) => {
    const t = await setupTournament(page.request, { competition: { rounds: 2 }, pairings: true });
    await page.goto(`/tournaments/${t.id}`);
    await page.getByRole('button', { name: '大会を終了する' }).click();
    await page.getByRole('button', { name: '終了する', exact: true }).click();
    await page.getByRole('button', { name: '大会を閲覧する' }).click();
    await expect(page).toHaveURL(/\/pairings$/);
    await expect(page.getByText(FINISHED)).toBeVisible();
    const changeButtons = page.getByRole('button', { name: '変更' });
    await expect(changeButtons).toHaveCount(2);
    for (const b of await changeButtons.all()) await expect(b).toBeDisabled();
    const scoreButtons = page.getByRole('button', { name: /ラウンド\d：/ });
    await expect(scoreButtons).toHaveCount(4);
    for (const b of await scoreButtons.all()) await expect(b).toBeDisabled();
  });

  test('I-ST-04 終了中はAPIでも変更・順位表作成・手動確定が拒否される（閲覧GETは可）', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { players: [P('Aさん'), P('Bさん')], pairings: true });
    await r.put(`/api/tournaments/${t.id}/status`, { data: { status: '終了' } });
    const scores = { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(30) };
    const responses = await Promise.all([
      r.put(`/api/tournaments/${t.id}`, { data: { name: 'x', date: '2026-11-16', place: 'y' } }),
      r.put(`/api/tournaments/${t.id}/competition`, { data: { competition: {}, confirmReset: true } }),
      r.put(`/api/tournaments/${t.id}/players`, { data: { players: [], confirmReset: true } }),
      r.post(`/api/tournaments/${t.id}/pairings`),
      r.put(`/api/tournaments/${t.id}/pairings/1/start-hole`, { data: { startHole: 3 } }),
      r.put(`/api/tournaments/${t.id}/scores`, { data: { partyNumber: 1, round: 1, scores } }),
      r.delete(`/api/tournaments/${t.id}/scores`, { data: { partyNumber: 1, round: 1 } }),
      r.post(`/api/tournaments/${t.id}/rankings`),
      r.put(`/api/tournaments/${t.id}/rankings/manual`, {
        data: { target: { kind: 'individual', playerId: t.byName['Aさん'] }, rank: 1 },
      }),
    ]);
    for (const res of responses) {
      expect(res.status(), res.url()).toBe(409);
      expect((await res.json()).error.code).toBe('TOURNAMENT_FINISHED');
    }
    expect((await r.get(`/api/tournaments/${t.id}`)).status()).toBe(200);
    expect((await r.get('/api/tournaments')).status()).toBe(200);
    const d = await getDetail(r, t.id);
    expect(d.parties[0].startHole).toBe(1);
    expect(d.scores).toHaveLength(0);
    expect(d.players).toHaveLength(2);
    expect(d.ranking).toBeNull();
  });

  test('I-ST-05 「大会を再開する」で「進行中」に戻り、再び編集・スコア入力ができる', async ({ page }) => {
    const t = await setupTournament(page.request, { pairings: true });
    await page.request.put(`/api/tournaments/${t.id}/status`, { data: { status: '終了' } });
    await page.goto(`/tournaments/${t.id}`);
    await page.getByRole('button', { name: '大会を再開する' }).click();
    await page.getByRole('dialog', { name: '大会を再開しますか？' }).getByRole('button', { name: '再開する' }).click();
    await expect(page.getByText('進行中', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/大会名/)).toBeEnabled();
    await page.getByRole('button', { name: '大会を開催する' }).click();
    await expect(page.getByRole('button', { name: '変更' }).first()).toBeEnabled();
    await expect(page.getByRole('button', { name: /ラウンド1：/ }).first()).toBeEnabled();
  });
});
