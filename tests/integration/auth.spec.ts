import { readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { ADMIN, H, loginAdmin, loginViewer, P, setupTournament } from './helpers';

test.describe('1. 認証・閲覧モード・ログアウト', () => {
  test('I-AUTH-01 未ログインで管理者画面にアクセスするとログイン画面へリダイレクトする', async ({ page }) => {
    await page.goto('/tournaments');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('I-AUTH-02 未ログインでのAPI呼び出しは401', async ({ request }) => {
    const res = await request.get('/api/tournaments');
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });

  test('I-AUTH-03 正しいID・パスワードでログインできる', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('ID').fill(ADMIN.id);
    await page.getByLabel('パスワード').fill(ADMIN.password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await expect(page).toHaveURL(/\/tournaments$/);
    await expect(page.getByRole('heading', { name: '大会一覧' })).toBeVisible();
  });

  test('I-AUTH-04 誤ったID・パスワードではログインできない', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('ID').fill(ADMIN.id);
    await page.getByLabel('パスワード').fill('wrong-password');
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await expect(page.getByText('IDまたはパスワードが正しくありません')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('I-AUTH-05 閲覧モードではバッジを表示し、書き込み系ボタンがdisabledになる', async ({ page, playwright }) => {
    const admin = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
    await admin.post('/api/auth/login', { data: ADMIN });
    const t = await setupTournament(admin, { players: [P('Aさん'), P('Bさん')], pairings: true });
    await admin.put(`/api/tournaments/${t.id}/scores`, {
      data: { partyNumber: 1, round: 1, scores: { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(30) } },
    });
    await admin.post(`/api/tournaments/${t.id}/rankings`);
    await admin.post('/api/backups');
    await admin.dispose();

    await page.goto('/login');
    await page.getByRole('button', { name: /閲覧モードで見る/ }).click();
    await expect(page).toHaveURL(/\/tournaments$/);
    await expect(page.getByText('閲覧モード', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ 新規作成' })).toBeDisabled();
    const row = page.getByTestId('tournament-row').filter({ hasText: t.name });
    await expect(row.getByRole('button', { name: '削除' })).toBeDisabled();

    await row.click();
    await expect(page).toHaveURL(new RegExp(`/tournaments/${t.id}$`));
    await expect(page.getByLabel(/大会名/)).toBeDisabled();
    // 書き換え系のボタンは非表示にせず、表示したまま disabled にする
    for (const name of ['保存', 'キャンセル', '組合せ表を作成する', '大会を開催する', '大会を終了する']) {
      await expect(page.getByRole('button', { name, exact: true }), name).toBeVisible();
      await expect(page.getByRole('button', { name, exact: true }), name).toBeDisabled();
    }
    await expect(page.getByRole('button', { name: '大会を閲覧する' })).toBeEnabled();

    await page.getByRole('link', { name: '競技情報' }).click();
    await expect(page.getByLabel('ラウンド数')).toBeDisabled();
    await expect(page.getByLabel('変換あり')).toBeDisabled();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '組合せ表を作成する' })).toBeDisabled();

    await page.getByRole('link', { name: '選手情報' }).click();
    await expect(page.getByRole('button', { name: '+ 新規登録' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '編集' }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: '削除' }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '組合せ表を作成する' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '大会を開催する' })).toBeDisabled();

    await page.getByRole('link', { name: '大会情報' }).click();
    await page.getByRole('button', { name: '大会を閲覧する' }).click();
    await expect(page).toHaveURL(/\/pairings$/);
    await expect(page.getByRole('button', { name: '変更' }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: /ラウンド1/ }).first()).toBeDisabled();

    await page.getByRole('link', { name: '順位表' }).click();
    await expect(page.getByRole('button', { name: '順位表作成' })).toBeDisabled();
    await expect(page.getByTestId('individual-row')).toHaveCount(2);
    for (const b of await page.getByRole('button', { name: '手動確定' }).all()) await expect(b).toBeDisabled();

    await page.getByRole('link', { name: 'バックアップ' }).click();
    await expect(page).toHaveURL(/\/settings\/backup$/);
    await expect(page.getByRole('button', { name: '手動バックアップ' })).toBeDisabled();
    await page.getByTestId('backup-row').first().getByRole('radio').check();
    await expect(page.getByRole('button', { name: '復元', exact: true })).toBeDisabled();
  });

  test('I-AUTH-06 閲覧モードでの書き込みAPIはすべて403', async ({ page, playwright }) => {
    const admin = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
    await admin.post('/api/auth/login', { data: ADMIN });
    const t = await setupTournament(admin, { pairings: true });
    const before = await (await admin.get(`/api/tournaments/${t.id}`)).json();

    await loginViewer(page);
    const r = page.request;
    const party = t.parties[0];
    const calls = [
      r.post('/api/tournaments', { data: { name: 'x', date: '2026-11-16', place: 'y' } }),
      r.put(`/api/tournaments/${t.id}`, { data: { name: 'x', date: '2026-11-16', place: 'y' } }),
      r.delete(`/api/tournaments/${t.id}`),
      r.put(`/api/tournaments/${t.id}/status`, { data: { status: '終了' } }),
      r.put(`/api/tournaments/${t.id}/competition`, { data: { competition: {} } }),
      r.put(`/api/tournaments/${t.id}/players`, { data: { players: [] } }),
      r.post(`/api/tournaments/${t.id}/pairings`),
      r.put(`/api/tournaments/${t.id}/pairings/${party.partyNumber}/start-hole`, { data: { startHole: 2 } }),
      r.put(`/api/tournaments/${t.id}/scores`, {
        data: { partyNumber: party.partyNumber, round: 1, scores: Object.fromEntries(party.playerIds.map((id) => [id, H(30)])) },
      }),
      r.delete(`/api/tournaments/${t.id}/scores`, { data: { partyNumber: party.partyNumber, round: 1 } }),
      r.post(`/api/tournaments/${t.id}/rankings`),
      r.put(`/api/tournaments/${t.id}/rankings/manual`, { data: { target: { kind: 'individual', playerId: 'x' }, rank: 1 } }),
      r.post('/api/backups'),
      r.post('/api/backups/xxx/restore'),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status(), res.url()).toBe(403);
      expect((await res.json()).error.code).toBe('FORBIDDEN');
    }
    expect((await r.get(`/api/tournaments/${t.id}`)).status()).toBe(200);
    expect((await r.get('/api/backups')).status()).toBe(200);
    const after = await (await admin.get(`/api/tournaments/${t.id}`)).json();
    expect(after).toEqual(before);
    await admin.dispose();
  });

  test('I-AUTH-07 ログイン情報の変更：新パスワード8文字未満・現在の情報の誤りはエラー', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'ログイン情報を変更する' }).click();
    const dialog = page.getByRole('dialog', { name: 'ログイン情報の変更' });
    await dialog.getByPlaceholder('現在のID').fill(ADMIN.id);
    await dialog.getByPlaceholder('現在のパスワード').fill('wrong-password');
    await dialog.getByPlaceholder('新しいID').fill('admin2');
    await dialog.getByPlaceholder('新しいパスワード（最低8文字）').fill('newpassword');
    await dialog.getByRole('button', { name: '変更する' }).click();
    await expect(dialog.getByText('現在のID・パスワードが正しくありません')).toBeVisible();
    // 新パスワード8文字未満：ダイアログ上で入力を受け付けない（minLength）
    await dialog.getByPlaceholder('現在のパスワード').fill(ADMIN.password);
    await dialog.getByPlaceholder('新しいパスワード（最低8文字）').fill('short');
    await dialog.getByRole('button', { name: '変更する' }).click();
    expect(await dialog.getByPlaceholder('新しいパスワード（最低8文字）').evaluate((el: HTMLInputElement) => el.validity.tooShort)).toBe(true);
    await expect(dialog.getByText('ログイン情報を変更しました。')).toHaveCount(0);

    const res = await page.request.post('/api/auth/credentials', {
      data: { currentId: ADMIN.id, currentPassword: ADMIN.password, newId: 'admin2', newPassword: 'short' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.message).toMatch(/8文字以上/);
    expect((await page.request.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
  });

  test('I-AUTH-08 ログイン情報の変更後は新しいID・パスワードでのみログインできる', async ({ request }) => {
    const changed = { id: 'admin-new', password: 'new-password-123' };
    const res = await request.post('/api/auth/credentials', {
      data: { currentId: ADMIN.id, currentPassword: ADMIN.password, newId: changed.id, newPassword: changed.password },
    });
    expect(res.ok()).toBeTruthy();
    try {
      expect((await request.post('/api/auth/login', { data: changed })).ok()).toBeTruthy();
      expect((await request.post('/api/auth/login', { data: ADMIN })).status()).toBe(401);
    } finally {
      // 他のテストのため元に戻す
      const back = await request.post('/api/auth/credentials', {
        data: { currentId: changed.id, currentPassword: changed.password, newId: ADMIN.id, newPassword: ADMIN.password },
      });
      expect(back.ok()).toBeTruthy();
    }
  });

  test('I-AUTH-09 ログアウト確認で「しない」を選ぶとログアウトしない', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/tournaments');
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await page.getByRole('dialog', { name: 'ログアウトしますか？' }).getByRole('button', { name: 'しない' }).click();
    await expect(page).toHaveURL(/\/tournaments$/);
    expect((await page.request.get('/api/tournaments')).status()).toBe(200);
  });

  test('I-AUTH-10/12 「バックアップしない」でログアウトし、セッションが無効になる', async ({ page }) => {
    await loginAdmin(page);
    const before = (await (await page.request.get('/api/backups')).json()).data.length;
    await page.goto('/tournaments');
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await page.getByRole('button', { name: 'ログアウトする' }).click();
    await page.getByRole('dialog', { name: 'バックアップを作成しますか？' }).getByRole('button', { name: 'しない' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/tournaments');
    await expect(page).toHaveURL(/\/login$/);
    await loginAdmin(page);
    expect((await (await page.request.get('/api/backups')).json()).data.length).toBe(before);
  });

  test('I-AUTH-11 「バックアップする」でログアウト契機のバックアップを作成してログアウトする', async ({ page }) => {
    await loginAdmin(page);
    const t = await setupTournament(page.request, { players: [P('Aさん'), P('Bさん')] });
    const before = (await (await page.request.get('/api/backups')).json()).data as { id: string }[];
    await page.goto(`/tournaments/${t.id}`);
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await page.getByRole('button', { name: 'ログアウトする' }).click();
    await page.getByRole('button', { name: 'バックアップする' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await loginAdmin(page);
    const after = (await (await page.request.get('/api/backups')).json()).data as { id: string; trigger: string }[];
    const added = after.filter((b) => !before.some((x) => x.id === b.id));
    expect(added.map((b) => b.trigger)).toEqual(['ログアウト']);
  });

  test('I-AUTH-13 閲覧モードのログアウトでは「バックアップする」を選べず、APIでもバックアップは作成されない', async ({ page }) => {
    await loginAdmin(page);
    const before = (await (await page.request.get('/api/backups')).json()).data as { id: string }[];
    await loginViewer(page);
    await page.goto('/tournaments');
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await page.getByRole('button', { name: 'ログアウトする' }).click();
    await expect(page.getByRole('button', { name: 'バックアップする' })).toBeDisabled();
    await loginViewer(page);
    const res = await page.request.post('/api/auth/logout', { data: { backup: true } });
    expect((await res.json()).data.backupCreated).toBe(false);
    await loginAdmin(page);
    const after = (await (await page.request.get('/api/backups')).json()).data as { id: string }[];
    expect(after.map((b) => b.id)).toEqual(before.map((b) => b.id));
  });

  test('I-AUTH-14 管理者パスワードは平文ではなくハッシュ化して保存される', async ({ request }) => {
    expect((await request.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
    const raw = readFileSync(path.join('.test-data', 'admin.json'), 'utf-8');
    expect(raw).not.toContain(ADMIN.password);
    expect(JSON.parse(raw).passwordHash).toMatch(/^\$2[aby]\$/);
  });

  test('I-AUTH-15 未ログインでは書き込みAPI（作成・バックアップ・復元・ログイン情報以外）も401で拒否され、データは変わらない', async ({ request, playwright }) => {
    const calls = [
      request.post('/api/tournaments', { data: { name: 'x', date: '2026-11-16', place: 'y' } }),
      request.get('/api/tournaments/unknown'),
      request.put('/api/tournaments/unknown/players', { data: { players: [] } }),
      request.post('/api/tournaments/unknown/pairings'),
      request.post('/api/tournaments/unknown/rankings'),
      request.get('/api/backups'),
      request.post('/api/backups'),
      request.post('/api/backups/xxx/restore'),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status(), res.url()).toBe(401);
      expect((await res.json()).error.code).toBe('UNAUTHORIZED');
    }
    const admin = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
    await admin.post('/api/auth/login', { data: ADMIN });
    const list = (await (await admin.get('/api/tournaments')).json()).data as { name: string }[];
    expect(list.some((t) => t.name === 'x')).toBe(false);
    await admin.dispose();
  });
});
