import { expect, test } from '@playwright/test';
import { createTournament, getDetail, H, loginAdmin, P, saveScores, setupTournament, uniqueName } from './helpers';

test.beforeEach(async ({ page }) => loginAdmin(page));

function todayTokyo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

test.describe('2. 大会一覧・大会情報', () => {
  test('I-TRN-01 大会を新規登録できる', async ({ page }) => {
    const name = uniqueName('新規大会');
    await page.goto('/tournaments');
    await page.getByRole('button', { name: '+ 新規作成' }).click();
    await expect(page).toHaveURL(/\/tournaments\/new$/);
    await page.getByLabel(/大会名/).fill(name);
    await page.getByLabel(/開催日/).fill('2026-12-01');
    await page.getByLabel(/開催場所/).fill('第二公園');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page).toHaveURL(/\/tournaments\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('2026/12/01・第二公園')).toBeVisible();
    await expect(page.getByRole('link', { name: '競技情報' })).toBeVisible();
    await expect(page.getByRole('button', { name: '組合せ表を作成する' })).toBeVisible();
    await page.goto('/tournaments');
    const row = page.getByTestId('tournament-row').filter({ hasText: name });
    await expect(row).toContainText('進行中');
    await expect(row).toContainText('2026/12/01');
  });

  test('I-TRN-02 新規登録の開催日のデフォルトは登録日（日本時間）', async ({ page }) => {
    await page.goto('/tournaments/new');
    await expect(page.getByLabel(/開催日/)).toHaveValue(todayTokyo());
  });

  test('I-TRN-03 新規登録のキャンセルで一覧へ戻る', async ({ page }) => {
    const before = (await (await page.request.get('/api/tournaments')).json()).data.length;
    await page.goto('/tournaments/new');
    await page.getByLabel(/大会名/).fill('キャンセル大会');
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(page).toHaveURL(/\/tournaments$/);
    expect((await (await page.request.get('/api/tournaments')).json()).data.length).toBe(before);
  });

  test('I-TRN-04 大会一覧は行選択で大会情報画面へ遷移する', async ({ page }) => {
    const t = await createTournament(page.request, { place: uniqueName('行選択会場') });
    await page.goto('/tournaments');
    const row = page.getByTestId('tournament-row').filter({ hasText: t.name });
    await row.getByRole('cell').nth(2).click(); // 開催場所のセル
    await expect(page).toHaveURL(new RegExp(`/tournaments/${t.id}$`));
  });

  test('I-TRN-05 削除ボタンは行選択を起こさず、確認ダイアログのキャンセルで削除されない', async ({ page }) => {
    const t = await createTournament(page.request);
    await page.goto('/tournaments');
    const row = page.getByTestId('tournament-row').filter({ hasText: t.name });
    await row.getByRole('button', { name: '削除' }).click();
    const dialog = page.getByRole('dialog', { name: '大会を削除しますか？' });
    await expect(dialog).toContainText('紐づく競技情報・選手情報・組合せ表・スコア表・順位表がすべて削除されます');
    await expect(page).toHaveURL(/\/tournaments$/);
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(row).toBeVisible();
    expect((await page.request.get(`/api/tournaments/${t.id}`)).status()).toBe(200);
  });

  test('I-TRN-06 大会削除で紐づくデータが連鎖削除され、他大会は残る', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { players: [P('Aさん'), P('Bさん')], pairings: true });
    await saveScores(r, t.id, t.parties[0].partyNumber, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(31) });
    await r.post(`/api/tournaments/${t.id}/rankings`);
    const other = await createTournament(r);
    await page.goto('/tournaments');
    const row = page.getByTestId('tournament-row').filter({ hasText: t.name });
    await row.getByRole('button', { name: '削除' }).click();
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(row).toHaveCount(0);
    expect((await r.get(`/api/tournaments/${t.id}`)).status()).toBe(404);
    expect((await r.get(`/api/tournaments/${other.id}`)).status()).toBe(200);
  });

  test('I-TRN-07 大会情報を編集・保存できる', async ({ page }) => {
    const t = await createTournament(page.request);
    const name = uniqueName('編集後');
    await page.goto(`/tournaments/${t.id}`);
    await page.getByLabel(/大会名/).fill(name);
    await page.getByLabel(/開催日/).fill('2026-10-01');
    await page.getByLabel(/開催場所/).fill('河川敷');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByRole('status')).toHaveText('保存しました');
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('2026/10/01・河川敷')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/大会名/)).toHaveValue(name);
    await expect(page.getByLabel(/開催日/)).toHaveValue('2026-10-01');
    await expect(page.getByLabel(/開催場所/)).toHaveValue('河川敷');
    await page.goto('/tournaments');
    await expect(page.getByTestId('tournament-row').filter({ hasText: name })).toContainText('河川敷');
  });

  test('I-TRN-08 大会名・開催場所の文字数超過はエラーで保存されない', async ({ page }) => {
    const t = await createTournament(page.request);
    await page.goto(`/tournaments/${t.id}`);
    await page.getByLabel(/大会名/).fill('あ'.repeat(51));
    await page.getByLabel(/開催場所/).fill('い'.repeat(51));
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('大会名は50文字以内で入力してください')).toBeVisible();
    await expect(page.getByText('開催場所は50文字以内で入力してください')).toBeVisible();
    expect((await getDetail(page.request, t.id)).tournament.name).toBe(t.name);
    const res = await page.request.put(`/api/tournaments/${t.id}`, { data: { name: 'あ'.repeat(51), date: '2026-11-16', place: 'x' } });
    expect(res.status()).toBe(400);
  });

  test('I-TRN-09 必須項目が空の場合はエラーで保存されない', async ({ page }) => {
    const t = await createTournament(page.request);
    await page.goto(`/tournaments/${t.id}`);
    await page.getByLabel(/大会名/).fill('');
    await page.getByLabel(/開催日/).fill('');
    await page.getByLabel(/開催場所/).fill('');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('大会名を入力してください')).toBeVisible();
    await expect(page.getByText('開催日を入力してください')).toBeVisible();
    await expect(page.getByText('開催場所を入力してください')).toBeVisible();
    expect((await getDetail(page.request, t.id)).tournament.name).toBe(t.name);
  });

  test('I-TRN-10 大会名・開催場所の入力欄は全角50文字でもスクロールしない', async ({ page }) => {
    const t = await createTournament(page.request);
    const full = '漢'.repeat(50);
    for (const url of ['/tournaments/new', `/tournaments/${t.id}`]) {
      await page.goto(url);
      for (const label of [/大会名/, /開催場所/]) {
        const input = page.getByLabel(label);
        await input.fill(full);
        const { scrollWidth, clientWidth, textWidth, fontSize } = await input.evaluate((el: HTMLInputElement) => {
          // 入力欄と同じフォントで文字列の実幅を測る（全角フォントが無い環境で空振りしないことの確認用）
          const style = getComputedStyle(el);
          const span = document.createElement('span');
          span.style.font = style.font;
          span.style.whiteSpace = 'pre';
          span.textContent = el.value;
          document.body.appendChild(span);
          const w = span.getBoundingClientRect().width;
          span.remove();
          return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, textWidth: w, fontSize: parseFloat(style.fontSize) };
        });
        expect(textWidth, '全角文字が1文字＝約1emで描画されていること').toBeGreaterThanOrEqual(50 * fontSize * 0.95);
        expect(scrollWidth, `${url} ${label}`).toBeLessThanOrEqual(clientWidth);
      }
    }
  });

  test('I-TRN-11 編集のキャンセルで保存済みの値に戻る', async ({ page }) => {
    const t = await createTournament(page.request);
    await page.goto(`/tournaments/${t.id}`);
    await page.getByLabel(/大会名/).fill('一時的な変更');
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(page.getByLabel(/大会名/)).toHaveValue(t.name);
  });

  test('I-TRN-12 存在しない大会のURLは404', async ({ page }) => {
    const res = await page.goto('/tournaments/unknown-id');
    expect(res?.status()).toBe(404);
  });

  test('I-TRN-13 新規作成時（未保存）はタブ・ステータス・生成系ボタンを表示しない', async ({ page }) => {
    await page.goto('/tournaments/new');
    await expect(page.getByRole('heading', { name: '大会情報登録' })).toBeVisible();
    for (const name of ['大会情報', '競技情報', '選手情報']) await expect(page.getByRole('link', { name })).toHaveCount(0);
    for (const name of ['組合せ表を作成する', '大会を開催する', '大会を終了する']) await expect(page.getByRole('button', { name })).toHaveCount(0);
    await expect(page.getByText('進行中', { exact: true })).toHaveCount(0);
  });

  test('I-NAV-01 ヘッダーの「バックアップ」で[A8]へ、[A8]の「← 大会一覧」で[A2]へ遷移する', async ({ page }) => {
    await page.goto('/tournaments');
    await page.getByRole('link', { name: 'バックアップ' }).click();
    await expect(page).toHaveURL(/\/settings\/backup$/);
    await expect(page.getByRole('heading', { name: 'バックアップ・リストア' })).toBeVisible();
    await page.getByRole('link', { name: '← 大会一覧' }).click();
    await expect(page).toHaveURL(/\/tournaments$/);
  });
});
