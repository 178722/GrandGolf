import { expect, test } from '@playwright/test';
import { createTournament, getDetail, H, loginAdmin, P, saveScores, setupTournament } from './helpers';

test.beforeEach(async ({ page }) => loginAdmin(page));

function todayTokyo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

test.describe('9. バックアップ・リストア', () => {
  test('I-BK-01 手動バックアップで履歴に作成日時（秒単位）・契機「手動」が追加される', async ({ page }) => {
    const before = (await (await page.request.get('/api/backups')).json()).data.length;
    await page.goto('/settings/backup');
    await expect(page.getByTestId('backup-row')).toHaveCount(before);
    await page.getByRole('button', { name: '手動バックアップ' }).click();
    await expect(page.getByRole('status')).toHaveText('バックアップを作成しました');
    await expect(page.getByTestId('backup-row')).toHaveCount(Math.min(before + 1, 20));
    await expect(page.getByTestId('backup-row').first()).toHaveText(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} 手動$/);
  });

  test('I-BK-02/03 復元は選択→復元→確認の順で行い、キャンセルでは復元されず、実行で完全に上書きされる', async ({ page }) => {
    const r = page.request;
    const t = await createTournament(r, { name: '復元前の名前' });
    const backup = (await (await r.post('/api/backups')).json()).data;
    await r.put(`/api/tournaments/${t.id}`, { data: { name: '変更後の名前', date: '2026-11-16', place: 'x' } });
    const extra = await createTournament(r);
    const historyCount = (await (await r.get('/api/backups')).json()).data.length;
    await page.goto('/settings/backup');
    await expect(page.getByTestId('backup-row')).toHaveCount(historyCount);
    await expect(page.getByRole('button', { name: '復元', exact: true })).toBeDisabled();
    await page.getByTestId('backup-row').first().getByRole('radio').check();
    await page.getByRole('button', { name: '復元', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '復元の最終確認' });
    await expect(dialog).toContainText('現在のすべてのデータが、選択したバックアップ');
    await expect(dialog).toContainText('の内容で完全に上書きされます。元に戻せません。復元しますか？');
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    expect((await getDetail(r, t.id)).tournament.name).toBe('変更後の名前');

    await page.getByRole('button', { name: '復元', exact: true }).click();
    await page.getByRole('button', { name: '復元する' }).click();
    await expect(page.getByRole('status')).toHaveText('復元しました');
    expect((await getDetail(r, t.id)).tournament.name).toBe('復元前の名前');
    expect((await r.get(`/api/tournaments/${extra.id}`)).status()).toBe(404);
    await page.reload();
    await expect(page.getByTestId('backup-row')).toHaveCount(historyCount);
    expect(backup.trigger).toBe('手動');
  });

  test('I-BK-04 履歴を作成日時の期間で絞り込める', async ({ page }) => {
    await page.request.post('/api/backups');
    await page.goto('/settings/backup');
    const today = todayTokyo();
    await page.getByLabel('開始日').fill(today);
    await page.getByLabel('終了日').fill(today);
    await page.getByRole('button', { name: '絞込' }).click();
    await expect(page.getByTestId('backup-row').first()).toBeVisible();
    await page.getByLabel('開始日').fill('2000-01-01');
    await page.getByLabel('終了日').fill('2000-01-02');
    await page.getByRole('button', { name: '絞込' }).click();
    await expect(page.getByTestId('backup-row')).toHaveCount(0);
    await expect(page.getByText('バックアップ履歴はありません')).toBeVisible();
  });

  test('I-BK-05 バックアップAPIは一覧のみで、業務データを含まない', async ({ page }) => {
    await page.request.post('/api/backups');
    const list = (await (await page.request.get('/api/backups')).json()).data as Record<string, unknown>[];
    expect(list.length).toBeGreaterThan(0);
    for (const b of list) expect(Object.keys(b).sort()).toEqual(['createdAt', 'id', 'trigger']);
  });

  test('I-BK-06 バックアップの保持数は20件で、超過分は作成日時の古いものから削除される（ログアウト契機も同じ上限）', async ({ page }) => {
    const r = page.request;
    const created: { id: string; createdAt: string; trigger: string }[] = [];
    for (let i = 0; i < 21; i++) created.push((await (await r.post('/api/backups')).json()).data);
    // ログアウト契機のバックアップも同じ履歴・上限の対象
    expect((await (await r.post('/api/auth/logout', { data: { backup: true } })).json()).data.backupCreated).toBe(true);
    await loginAdmin(page);
    const list = (await (await r.get('/api/backups')).json()).data as { id: string; createdAt: string; trigger: string }[];
    expect(list).toHaveLength(20);
    expect(list[0].trigger).toBe('ログアウト');
    // 新しい順に並び、今回作成した手動の最新19件が残り、最も古い2件は削除されている
    expect(list.map((b) => b.createdAt)).toEqual([...list.map((b) => b.createdAt)].sort().reverse());
    expect(list.slice(1).map((b) => b.id)).toEqual(created.slice(2).map((b) => b.id).reverse());
    for (const old of created.slice(0, 2)) {
      expect((await r.post(`/api/backups/${old.id}/restore`)).status()).toBe(404);
    }
    await page.goto('/settings/backup');
    await expect(page.getByTestId('backup-row')).toHaveCount(20);
    await expect(page.getByTestId('backup-row').first()).toHaveText(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} ログアウト$/);
  });

  test('I-BK-07 復元後も、復元したものより新しいバックアップを含む全履歴が残り、そこから再度復元できる', async ({ page }) => {
    const r = page.request;
    const t = await createTournament(r, { name: '版1' });
    const v1 = (await (await r.post('/api/backups')).json()).data;
    await r.put(`/api/tournaments/${t.id}`, { data: { name: '版2', date: '2026-11-16', place: 'グラウンド' } });
    const v2 = (await (await r.post('/api/backups')).json()).data;
    expect((await r.post(`/api/backups/${v1.id}/restore`)).ok()).toBe(true);
    expect((await getDetail(r, t.id)).tournament.name).toBe('版1');
    const ids = ((await (await r.get('/api/backups')).json()).data as { id: string }[]).map((b) => b.id);
    expect(ids).toContain(v1.id);
    expect(ids).toContain(v2.id);
    // 画面から新しい方（版2）を選んで復元する
    await page.goto('/settings/backup');
    const index = ids.indexOf(v2.id);
    await page.getByTestId('backup-row').nth(index).getByRole('radio').check();
    await page.getByRole('button', { name: '復元', exact: true }).click();
    await page.getByRole('button', { name: '復元する' }).click();
    await expect(page.getByRole('status')).toHaveText('復元しました');
    expect((await getDetail(r, t.id)).tournament.name).toBe('版2');
  });

  test('I-BK-08 期間絞り込みの境界：日本時間の日付で両端を含む。開始日のみ・終了日のみ・開始日＞終了日・不正な日付', async ({ page }) => {
    const r = page.request;
    const b = (await (await r.post('/api/backups')).json()).data as { id: string };
    const today = todayTokyo();
    const shift = (days: number) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const ids = async (q: string) => {
      const res = await r.get(`/api/backups?${q}`);
      expect(res.status(), q).toBe(200);
      return ((await res.json()).data as { id: string }[]).map((x) => x.id);
    };
    expect(await ids(`from=${today}&to=${today}`)).toContain(b.id);
    expect(await ids(`from=${today}`)).toContain(b.id);
    expect(await ids(`to=${today}`)).toContain(b.id);
    expect(await ids(`to=${shift(-1)}`)).not.toContain(b.id);
    expect(await ids(`from=${shift(1)}`)).not.toContain(b.id);
    expect(await ids(`from=${shift(1)}&to=${shift(-1)}`)).toEqual([]);
    for (const q of ['from=2026-02-30', 'to=2026/11/19', 'from=abc']) {
      const res = await r.get(`/api/backups?${q}`);
      expect(res.status(), q).toBe(400);
      expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
    }
    // 画面：開始日のみ指定でも絞り込める
    await page.goto('/settings/backup');
    await page.getByLabel('開始日').fill(shift(1));
    await page.getByRole('button', { name: '絞込' }).click();
    await expect(page.getByText('バックアップ履歴はありません')).toBeVisible();
    await page.getByLabel('開始日').fill(today);
    await page.getByRole('button', { name: '絞込' }).click();
    await expect(page.getByTestId('backup-row').first()).toBeVisible();
  });

  test('I-BK-09 存在しない・不正な形式のバックアップIDの復元は404で、データは変わらない', async ({ page }) => {
    const r = page.request;
    const t = await createTournament(r, { name: '復元されない大会' });
    for (const id of ['2000-01-01T00-00-00-000Z-zzzzzz', '..%2Fdb', 'a.b']) {
      const res = await r.post(`/api/backups/${id}/restore`);
      expect(res.status(), id).toBe(404);
    }
    expect((await getDetail(r, t.id)).tournament.name).toBe('復元されない大会');
  });

  test('I-BK-10 バックアップには全業務データ（大会・競技情報・選手・組合せ表・スコア・順位表）が含まれ、大会削除後の復元ですべて元に戻る', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { competition: { rounds: 2, teamBattleEnabled: true, teamRankingMethod: '平均' }, players: [P('Aさん'), P('Bさん')], pairings: true });
    await saveScores(r, t.id, 1, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(31) });
    await saveScores(r, t.id, 1, 2, { [t.byName['Aさん']]: H(28), [t.byName['Bさん']]: H(27) });
    await r.put(`/api/tournaments/${t.id}/pairings/1/start-hole`, { data: { startHole: 4 } });
    await r.post(`/api/tournaments/${t.id}/rankings`);
    await r.put(`/api/tournaments/${t.id}/status`, { data: { status: '終了' } });
    const before = await getDetail(r, t.id);
    const b = (await (await r.post('/api/backups')).json()).data;
    expect((await r.delete(`/api/tournaments/${t.id}`)).ok()).toBe(true);
    expect((await r.get(`/api/tournaments/${t.id}`)).status()).toBe(404);
    expect((await r.post(`/api/backups/${b.id}/restore`)).ok()).toBe(true);
    expect(await getDetail(r, t.id)).toEqual(before);
    expect(before.ranking.individual).toHaveLength(2);
    expect(before.tournament.status).toBe('終了');
  });
});
