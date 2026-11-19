import { expect, test, type Page } from '@playwright/test';
import { asInput, createTournament, generate, getDetail, H, loginAdmin, P, saveCompetition, saveScores, setupTournament } from './helpers';

test.beforeEach(async ({ page }) => loginAdmin(page));

async function fillPlayer(page: Page, v: { name?: string; birthDate?: string; teamName?: string; fixed?: boolean; partyNumber?: string }) {
  const dialog = page.getByRole('dialog');
  if (v.name !== undefined) await dialog.getByLabel('選手名').fill(v.name);
  if (v.birthDate !== undefined) await dialog.getByLabel('生年月日').fill(v.birthDate);
  if (v.teamName !== undefined) await dialog.getByLabel('チーム名').fill(v.teamName);
  if (v.fixed !== undefined) await dialog.getByLabel('固定').setChecked(v.fixed);
  if (v.partyNumber !== undefined) await dialog.getByLabel('パーティ番号').fill(v.partyNumber);
  await dialog.getByRole('button', { name: '保存して閉じる' }).click();
}

test.describe('4. 選手情報', () => {
  test('I-PLY-01/02 選手を新規登録し保存で反映、和暦は西暦で表示される', async ({ page }) => {
    const t = await createTournament(page.request);
    await saveCompetition(page.request, t.id, { partyAssignmentMethod: 'シャッフル' });
    await page.goto(`/tournaments/${t.id}/players`);
    await page.getByRole('button', { name: '+ 新規登録' }).click();
    await fillPlayer(page, { name: 'Aさん', birthDate: 'S46.05.24', teamName: 'スタッフ', fixed: true, partyNumber: '3' });
    await page.getByRole('button', { name: '+ 新規登録' }).click();
    await fillPlayer(page, { name: 'Bさん', birthDate: '1985/3/10' });
    await expect(page.getByText('未保存の変更があります')).toBeVisible();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('保存しました');
    await page.reload();
    const rows = page.getByTestId('player-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Aさん1971/05/24スタッフ固定3');
    await expect(rows.nth(1)).toContainText('Bさん1985/03/10-非固定-');
  });

  test('I-PLY-09 新規登録ダイアログ内で「追加して続けて登録」により連続登録でき、チーム名等は引き継がれる', async ({ page }) => {
    const t = await createTournament(page.request);
    await saveCompetition(page.request, t.id, { partyAssignmentMethod: 'チーム' });
    await page.goto(`/tournaments/${t.id}/players`);
    await page.getByRole('button', { name: '+ 新規登録' }).click();
    const dialog = page.getByRole('dialog', { name: '選手情報の新規登録' });
    const addNext = dialog.getByRole('button', { name: '追加して続けて登録' });
    await dialog.getByLabel('選手名').fill('Aさん');
    await dialog.getByLabel('生年月日').fill('1970/1/1');
    await dialog.getByLabel('チーム名').fill('東');
    await addNext.click();
    // ダイアログは開いたまま、選手名・生年月日はクリア、チーム名は引き継ぎ、選手名にフォーカス
    await expect(dialog.getByRole('status')).toHaveText('「Aさん」を一覧に追加しました。続けて入力できます。');
    await expect(dialog.getByLabel('選手名')).toHaveValue('');
    await expect(dialog.getByLabel('生年月日')).toHaveValue('');
    await expect(dialog.getByLabel('チーム名')).toHaveValue('東');
    await expect(dialog.getByLabel('選手名')).toBeFocused();
    await page.keyboard.type('Bさん');
    await dialog.getByLabel('生年月日').fill('1971/2/2');
    await addNext.click();
    // 入力エラー・重複名の場合はダイアログ内にエラー表示し追加しない
    await dialog.getByLabel('選手名').fill('Aさん');
    await dialog.getByLabel('生年月日').fill('1972/3/3');
    await addNext.click();
    await expect(dialog.getByText('選手名「Aさん」は既に登録されています')).toBeVisible();
    // 最後の1件は「保存して閉じる」で追加して閉じる
    await dialog.getByLabel('選手名').fill('Cさん');
    await dialog.getByRole('button', { name: '保存して閉じる' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('player-row')).toHaveCount(3);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('保存しました');
    const players = (await getDetail(page.request, t.id)).players as { name: string; teamName: string }[];
    expect(players.map((p) => [p.name, p.teamName])).toEqual([
      ['Aさん', '東'],
      ['Bさん', '東'],
      ['Cさん', '東'],
    ]);
  });

  test('I-PLY-10 編集ダイアログには「追加して続けて登録」を表示しない', async ({ page }) => {
    const t = await setupTournament(page.request);
    await page.goto(`/tournaments/${t.id}/players`);
    await page.getByTestId('player-row').first().getByRole('button', { name: '編集' }).click();
    const dialog = page.getByRole('dialog', { name: '選手情報の編集' });
    await expect(dialog.getByRole('button', { name: '保存して閉じる' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '追加して続けて登録' })).toHaveCount(0);
  });

  test('I-PLY-03 既存選手の編集・削除が保存で反映される', async ({ page }) => {
    const t = await setupTournament(page.request);
    await page.goto(`/tournaments/${t.id}/players`);
    await page.getByTestId('player-row').filter({ hasText: 'Aさん' }).getByRole('button', { name: '編集' }).click();
    await fillPlayer(page, { name: 'Aさん改' });
    await page.getByTestId('player-row').filter({ hasText: 'Cさん' }).getByRole('button', { name: '削除' }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('保存しました');
    await page.reload();
    await expect(page.getByTestId('player-row')).toHaveCount(2);
    await expect(page.getByTestId('player-row').nth(0)).toContainText('Aさん改');
    expect((await getDetail(page.request, t.id)).players.map((p: { name: string }) => p.name)).toEqual(['Aさん改', 'Bさん']);
  });

  test('I-PLY-04 入力エラーはダイアログ内に表示され、一覧に追加されない', async ({ page }) => {
    const t = await setupTournament(page.request); // パーティの決定方法：チーム（チーム名必須）
    await page.goto(`/tournaments/${t.id}/players`);
    await page.getByRole('button', { name: '+ 新規登録' }).click();
    await fillPlayer(page, { name: '', birthDate: '' });
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('選手名を入力してください')).toBeVisible();
    await expect(dialog.getByText('生年月日を入力してください')).toBeVisible();
    await expect(dialog.getByText('チーム名を入力してください')).toBeVisible();
    await fillPlayer(page, { name: 'あ'.repeat(11), birthDate: '1971-05-24', teamName: 'い'.repeat(11) });
    await expect(dialog.getByText('選手名は10文字以内で入力してください')).toBeVisible();
    await expect(dialog.getByText(/生年月日は YYYY\/MM\/DD/)).toBeVisible();
    await expect(dialog.getByText('チーム名は10文字以内で入力してください')).toBeVisible();
    await fillPlayer(page, { name: 'Aさん', birthDate: '1971/05/24', teamName: '東' });
    await expect(dialog.getByText('選手名「Aさん」は既に登録されています')).toBeVisible();
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(page.getByTestId('player-row')).toHaveCount(3);
  });

  test('I-PLY-05 パーティ番号はパーティ固定にチェックがある時だけ入力できる', async ({ page }) => {
    const t = await setupTournament(page.request);
    await page.goto(`/tournaments/${t.id}/players`);
    await page.getByRole('button', { name: '+ 新規登録' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('パーティ番号')).toBeDisabled();
    await dialog.getByLabel('固定').check();
    await expect(dialog.getByLabel('パーティ番号')).toBeEnabled();
    await dialog.getByLabel('固定').uncheck();
    await expect(dialog.getByLabel('パーティ番号')).toBeDisabled();
  });

  test('I-PLY-06 組合せ表生成後に選手を追加すると確認ダイアログを表示し、キャンセルでは保存されず、同意で組合せ表を削除して保存', async ({ page }) => {
    const t = await setupTournament(page.request, { pairings: true });
    await page.goto(`/tournaments/${t.id}/players`);
    await page.getByRole('button', { name: '+ 新規登録' }).click();
    await fillPlayer(page, { name: 'Dさん', birthDate: '1990/01/01', teamName: '西' });
    await page.getByRole('button', { name: '保存', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '組合せ表・スコア表の削除確認' });
    await expect(dialog).toBeVisible();
    // キャンセルでは保存されず、組合せ表も残る
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    let d = await getDetail(page.request, t.id);
    expect(d.players).toHaveLength(3);
    expect(d.parties.length).toBeGreaterThan(0);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.getByRole('button', { name: '変更する' }).click();
    await expect(page.getByRole('status')).toContainText('組合せ表・スコア表を削除しました');
    d = await getDetail(page.request, t.id);
    expect(d.players).toHaveLength(4);
    expect(d.parties).toHaveLength(0);
  });

  test('I-PLY-07 試合結果がある場合の削除・編集制限', async ({ page }) => {
    const t = await setupTournament(page.request, { pairings: true });
    const party = t.parties.find((p) => p.playerIds.includes(t.byName['Aさん']))!;
    await saveScores(page.request, t.id, party.partyNumber, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(31) });
    await page.goto(`/tournaments/${t.id}/players`);
    const rowA = page.getByTestId('player-row').filter({ hasText: 'Aさん' });
    const rowC = page.getByTestId('player-row').filter({ hasText: 'Cさん' });
    await expect(rowA.getByRole('button', { name: '削除' })).toBeDisabled();
    await expect(rowC.getByRole('button', { name: '削除' })).toBeEnabled();
    // 参加／不参加は組合せ表に影響するため、試合結果がある場合は変更できない
    await expect(rowC.getByRole('button', { name: '不参加' })).toBeDisabled();
    await rowC.getByRole('button', { name: '編集' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('チーム名')).toBeDisabled();
    await expect(dialog.getByLabel('固定')).toBeDisabled();
    await expect(dialog.getByLabel('パーティ番号')).toBeDisabled();
    await fillPlayer(page, { name: 'Cさん改' });
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('保存しました');
    const res = await page.request.put(`/api/tournaments/${t.id}/players`, {
      data: { players: t.players.filter((p) => p.name !== 'Aさん').map(asInput), confirmReset: true },
    });
    expect(res.status()).toBe(409);
  });

  test('I-PLY-11 「不参加」で選手情報を残したまま組合せ表から除外でき、「参加に戻す」で解除できる', async ({ page }) => {
    const t = await setupTournament(page.request, {
      competition: { partyAssignmentMethod: 'シャッフル', maxPartySize: 6 },
      players: [P('Aさん'), P('Bさん'), P('Cさん')],
    });
    await page.goto(`/tournaments/${t.id}/players`);
    const rowC = page.getByTestId('player-row').filter({ hasText: 'Cさん' });
    await rowC.getByRole('button', { name: '不参加' }).click();
    await expect(rowC).toContainText('不参加');
    await expect(rowC.getByRole('button', { name: '参加に戻す' })).toBeVisible();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('保存しました');
    await page.reload();
    await expect(page.getByTestId('player-row')).toHaveCount(3);
    await expect(page.getByTestId('player-row').filter({ hasText: 'Cさん' })).toHaveAttribute('data-absent', 'true');

    const parties = await generate(page.request, t.id);
    const ids = parties.flatMap((p: { playerIds: string[] }) => p.playerIds);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(t.byName['Cさん']);

    // 参加に戻す（組合せ表が作成済みのため削除確認が出る）
    await page.getByTestId('player-row').filter({ hasText: 'Cさん' }).getByRole('button', { name: '参加に戻す' }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '変更する' }).click();
    await expect(page.getByRole('status')).toHaveText('保存しました（組合せ表・スコア表を削除しました）');
    const d = await getDetail(page.request, t.id);
    expect(d.players.find((p: { name: string }) => p.name === 'Cさん').absent).toBe(false);
  });

  test('I-PLY-08 選手名の重複はサーバー側でも拒否される', async ({ page }) => {
    const t = await createTournament(page.request);
    const res = await page.request.put(`/api/tournaments/${t.id}/players`, { data: { players: [P('Aさん'), P('Aさん')] } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });

  test('I-PLY-12 試合結果がある場合、チーム名・パーティ固定・パーティ番号・不参加の変更はAPIで409、選手名・生年月日の変更は保存でき組合せ表・スコアは保持', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { players: [P('Aさん'), P('Bさん'), P('Cさん', '西')], pairings: true });
    const party = t.parties.find((p) => p.playerIds.includes(t.byName['Aさん']))!;
    await saveScores(r, t.id, party.partyNumber, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(31) });
    const base = t.players.map(asInput);
    const withC = (patch: Record<string, unknown>) => base.map((p) => (p.name === 'Cさん' ? { ...p, ...patch } : p));
    // 試合結果のないCさんについても、編成に影響する項目は変更できない
    for (const patch of [{ teamName: '南' }, { partyFixed: true, partyNumber: 5 }, { absent: true }]) {
      const res = await r.put(`/api/tournaments/${t.id}/players`, { data: { players: withC(patch), confirmReset: true } });
      expect(res.status(), JSON.stringify(patch)).toBe(409);
      expect((await res.json()).error.code).toBe('RESULTS_EXIST');
    }
    const fixedT = await setupTournament(r, { players: [P('Aさん', '東', '1970/01/01', { partyFixed: true, partyNumber: 2 }), P('Bさん')], pairings: true });
    const fp = fixedT.parties.find((p) => p.playerIds.includes(fixedT.byName['Aさん']))!;
    await saveScores(r, fixedT.id, fp.partyNumber, 1, Object.fromEntries(fp.playerIds.map((id) => [id, H(30)])));
    const moved = fixedT.players.map(asInput).map((p) => (p.name === 'Aさん' ? { ...p, partyNumber: 3 } : p));
    expect((await r.put(`/api/tournaments/${fixedT.id}/players`, { data: { players: moved, confirmReset: true } })).status()).toBe(409);

    // 選手名・生年月日は変更可能（組合せ表・スコアはそのまま）
    const before = await getDetail(r, t.id);
    const renamed = base.map((p) => (p.name === 'Aさん' ? { ...p, name: 'Aさん改', birthDate: 'S50.01.01' } : p));
    const ok = await r.put(`/api/tournaments/${t.id}/players`, { data: { players: renamed } });
    expect(ok.status()).toBe(200);
    const after = await getDetail(r, t.id);
    expect(after.players.find((p: { id: string }) => p.id === t.byName['Aさん'])).toMatchObject({ name: 'Aさん改', birthDate: '1975-01-01' });
    expect(after.parties).toEqual(before.parties);
    expect(after.scores).toEqual(before.scores);
  });

  test('I-PLY-13 試合結果がある大会でも、試合結果のない選手は削除でき、組合せ表から外れる（他のパーティ・スコアは保持）', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { players: [P('Aさん'), P('Bさん'), P('Cさん', '西'), P('Dさん', '西')], pairings: true });
    const east = t.parties.find((p) => p.playerIds.includes(t.byName['Aさん']))!;
    await saveScores(r, t.id, east.partyNumber, 1, { [t.byName['Aさん']]: H(30), [t.byName['Bさん']]: H(31) });
    const res = await r.put(`/api/tournaments/${t.id}/players`, { data: { players: t.players.filter((p) => p.name !== 'Dさん').map(asInput) } });
    expect(res.status()).toBe(200);
    const d = await getDetail(r, t.id);
    expect(d.players.map((p: { name: string }) => p.name)).toEqual(['Aさん', 'Bさん', 'Cさん']);
    const ids = d.parties.flatMap((p: { playerIds: string[] }) => p.playerIds);
    expect(ids).not.toContain(t.byName['Dさん']);
    expect(ids).toContain(t.byName['Cさん']);
    expect(d.parties).toHaveLength(2);
    expect(d.scores).toHaveLength(2);
  });

  test('I-PLY-14 組合せ表生成後（試合結果なし）、追加・削除・チーム名・固定・番号・不参加・選手名・生年月日のいずれの変更も確認なしだとAPIで409 CONFIRM_REQUIRED、確認ありで組合せ表を削除して保存、変更なしの保存は組合せ表を保持', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { pairings: true });
    const base = t.players.map(asInput);
    const variants: [string, unknown[]][] = [
      ['追加', [...base, P('Dさん', '西')]],
      ['削除', base.slice(1)],
      ['チーム名', base.map((p, i) => (i === 0 ? { ...p, teamName: '南' } : p))],
      ['固定・番号', base.map((p, i) => (i === 0 ? { ...p, partyFixed: true, partyNumber: 4 } : p))],
      ['不参加', base.map((p, i) => (i === 2 ? { ...p, absent: true } : p))],
      ['選手名', base.map((p, i) => (i === 0 ? { ...p, name: 'Aさん改' } : p))],
      ['生年月日', base.map((p, i) => (i === 0 ? { ...p, birthDate: '1971/05/25' } : p))],
    ];
    for (const [label, players] of variants) {
      const res = await r.put(`/api/tournaments/${t.id}/players`, { data: { players, confirmReset: false } });
      expect(res.status(), label).toBe(409);
      expect((await res.json()).error.code, label).toBe('CONFIRM_REQUIRED');
    }
    const before = await getDetail(r, t.id);
    expect(before.players).toHaveLength(3);
    expect(before.players[0].name).toBe('Aさん');
    // 内容に変更がない保存は確認不要で組合せ表を保持する
    expect((await r.put(`/api/tournaments/${t.id}/players`, { data: { players: base, confirmReset: false } })).status()).toBe(200);
    expect((await getDetail(r, t.id)).parties).toEqual(before.parties);
    // 選手名・生年月日のみの変更も、確認ありで組合せ表・スコア表を削除して保存する
    const renamed = base.map((p, i) => (i === 0 ? { ...p, name: 'Aさん改', birthDate: '1971/05/24' } : p));
    expect((await r.put(`/api/tournaments/${t.id}/players`, { data: { players: renamed, confirmReset: true } })).status()).toBe(200);
    const after = await getDetail(r, t.id);
    expect(after.parties).toHaveLength(0);
    expect(after.players[0]).toMatchObject({ name: 'Aさん改', birthDate: '1971-05-24' });
  });

  test('I-PLY-16 組合せ表生成後（試合結果なし）に選手名・生年月日を編集して保存すると確認ダイアログを表示し、キャンセルでは保存されず、同意で組合せ表を削除して保存', async ({ page }) => {
    const t = await setupTournament(page.request, { pairings: true });
    await page.goto(`/tournaments/${t.id}/players`);
    await page.getByTestId('player-row').filter({ hasText: 'Aさん' }).getByRole('button', { name: '編集' }).click();
    await fillPlayer(page, { name: 'Aさん改', birthDate: '1971/05/25' });
    await page.getByRole('button', { name: '保存', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '組合せ表・スコア表の削除確認' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    let d = await getDetail(page.request, t.id);
    expect(d.players.map((p: { name: string }) => p.name)).toContain('Aさん');
    expect(d.parties.length).toBeGreaterThan(0);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.getByRole('button', { name: '変更する' }).click();
    await expect(page.getByRole('status')).toContainText('組合せ表・スコア表を削除しました');
    d = await getDetail(page.request, t.id);
    expect(d.players.find((p: { name: string }) => p.name === 'Aさん改')).toMatchObject({ birthDate: '1971-05-25' });
    expect(d.parties).toHaveLength(0);
  });

  test('I-PLY-15 選手情報の境界値：パーティ番号1〜99、固定でパーティ番号なしはエラー、非固定の番号はnullで保存、選手名の重複は大会ごと', async ({ page }) => {
    const r = page.request;
    const t = await createTournament(r);
    await saveCompetition(r, t.id, { partyAssignmentMethod: 'シャッフル' });
    const put = (players: unknown[]) => r.put(`/api/tournaments/${t.id}/players`, { data: { players } });
    const ok = await put([
      P('一番', '', '1960/01/01', { partyFixed: true, partyNumber: 1 }),
      P('九十九番', '', '1960/01/01', { partyFixed: true, partyNumber: 99 }),
      P('非固定', '', '1960/01/01', { partyFixed: false, partyNumber: 7 }),
    ]);
    expect(ok.status()).toBe(200);
    const saved = (await ok.json()).data as { name: string; partyNumber: number | null }[];
    expect(saved.map((p) => p.partyNumber)).toEqual([1, 99, null]);
    for (const partyNumber of [0, 100, null, 1.5]) {
      const res = await put([P('固定', '', '1960/01/01', { partyFixed: true, partyNumber: partyNumber as number | null })]);
      expect(res.status(), String(partyNumber)).toBe(400);
      expect(Object.keys((await res.json()).error.details['0'])).toEqual(['partyNumber']);
    }
    // 別大会では同名の選手を登録できる
    const other = await createTournament(r);
    expect((await r.put(`/api/tournaments/${other.id}/players`, { data: { players: [P('一番')] } })).status()).toBe(200);
  });
});
