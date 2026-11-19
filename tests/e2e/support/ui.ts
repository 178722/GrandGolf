// E2Eテスト用の画面操作ヘルパー（結合テストの tests/integration/helpers.ts からは独立させる）。
// 画面のラベル・ボタン名は src/app・src/components の実装、docs/画面仕様書.md、docs/操作手順書.md に合わせる。
// 固定時間の待機は使わず、レスポンス待ちと expect のポーリングで画面の更新を待つ。

import { expect, type Locator, type Page } from '@playwright/test';
import { E2E_ADMIN } from '../fixtures/env';
import type { E2ECompetition, E2EDataset, E2EPlayer, E2ETournament } from '../fixtures/samples';

// ---------- 共通 ----------

/** ダイアログ（見出しで特定する） */
export const dialog = (page: Page, title: string): Locator => page.getByRole('dialog', { name: title });

/** 完全一致のボタン */
export const button = (scope: Page | Locator, name: string): Locator =>
  scope.getByRole('button', { name, exact: true });

/** 指定URL（末尾一致）・メソッドのAPIレスポンスを待つ Promise を返す（クリック前に呼ぶ） */
export function waitApi(page: Page, method: string, pathSuffix: string | RegExp) {
  return page.waitForResponse((res) => {
    if (res.request().method() !== method) return false;
    const path = new URL(res.url()).pathname;
    return typeof pathSuffix === 'string' ? path.endsWith(pathSuffix) : pathSuffix.test(path);
  });
}

/** 現在のURLから大会IDを取り出す */
export function tournamentIdOf(page: Page): string {
  const m = /\/tournaments\/([^/?#]+)/.exec(new URL(page.url()).pathname);
  if (!m || m[1] === 'new') throw new Error(`大会IDを取得できません: ${page.url()}`);
  return m[1];
}

// ---------- A1 ログイン・ログアウト ----------

export async function loginAsAdmin(page: Page, admin = E2E_ADMIN) {
  await page.goto('/login');
  await page.getByLabel('ID', { exact: true }).fill(admin.id);
  await page.getByLabel('パスワード', { exact: true }).fill(admin.password);
  await button(page, 'ログイン').click();
  await page.waitForURL(/\/tournaments$/);
  await expect(page.getByRole('heading', { name: '大会一覧' })).toBeVisible();
}

export async function loginAsViewer(page: Page) {
  await page.goto('/login');
  await button(page, '閲覧モードで見る（ID・パスワード不要）').click();
  await page.waitForURL(/\/tournaments$/);
  await expect(page.getByRole('heading', { name: '大会一覧' })).toBeVisible();
  await expect(page.getByText('閲覧モード', { exact: true })).toBeVisible();
}

/** 共通ヘッダーの「ログアウト」→「ログアウトする」→「バックアップする／しない」 */
export async function logout(page: Page, backup: boolean) {
  await button(page, 'ログアウト').click();
  await button(dialog(page, 'ログアウトしますか？'), 'ログアウトする').click();
  const confirm = dialog(page, 'バックアップを作成しますか？');
  await expect(confirm).toBeVisible();
  const res = waitApi(page, 'POST', '/api/auth/logout');
  await button(confirm, backup ? 'バックアップする' : 'しない').click();
  expect((await res).ok()).toBeTruthy();
  await page.waitForURL(/\/login$/);
}

// ---------- A2 大会一覧 ----------

/** A2の大会の行 */
export const tournamentRow = (page: Page, name: string): Locator =>
  page.getByTestId('tournament-row').filter({ hasText: name });

/** A2の行（大会名のセル）をクリックしてA3を開く */
export async function openTournament(page: Page, name: string) {
  await page.goto('/tournaments');
  await tournamentRow(page, name).getByText(name, { exact: true }).click();
  await page.waitForURL(/\/tournaments\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

// ---------- A3 大会情報 ----------

/** A2「+ 新規作成」→ A3（新規）で大会情報を入力して保存し、大会IDを返す */
export async function createTournament(page: Page, t: E2ETournament): Promise<string> {
  await page.goto('/tournaments');
  await button(page, '+ 新規作成').click();
  await page.waitForURL(/\/tournaments\/new$/);
  await expect(page.getByRole('heading', { name: '大会情報登録' })).toBeVisible();
  await page.getByLabel('大会名').fill(t.name);
  await page.getByLabel('開催日').fill(t.date);
  await page.getByLabel('開催場所').fill(t.place);
  const res = waitApi(page, 'POST', '/api/tournaments');
  await button(page, '保存').click();
  expect((await res).ok()).toBeTruthy();
  await page.waitForURL(/\/tournaments\/(?!new$)[^/]+$/);
  // 編集モード：大会名ヘッダー（ステータス「進行中」）と共通タブが表示される
  await expect(page.getByRole('heading', { level: 1, name: t.name })).toBeVisible();
  await expect(page.getByText('進行中', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '大会情報', exact: true })).toBeVisible();
  for (const tab of ['大会情報', '競技情報', '選手情報']) {
    await expect(page.getByRole('link', { name: tab, exact: true })).toBeVisible();
  }
  return tournamentIdOf(page);
}

/** A3〜A5共通タブで画面を切り替える */
export async function openTab(page: Page, tab: '大会情報' | '競技情報' | '選手情報') {
  await page.getByRole('link', { name: tab, exact: true }).click();
  const suffix = { 大会情報: /\/tournaments\/[^/]+$/, 競技情報: /\/competition$/, 選手情報: /\/players$/ }[tab];
  await page.waitForURL(suffix);
}

/** A3〜A5共通「組合せ表を作成する」→ 確認ダイアログ「作成する」 */
export async function createPairings(page: Page, opts: { regenerate?: boolean } = {}) {
  await button(page, '組合せ表を作成する').click();
  const d = dialog(page, '組合せ表を作成しますか？');
  if (opts.regenerate) {
    await expect(d).toContainText('組合せ表は作成済みです。再作成すると現在のパーティ編成・開始ホール・スコア表は上書きされます。');
  } else {
    await expect(d).toContainText('登録済みの全選手を対象に、パーティ編成と開始ホールを自動で作成します。');
  }
  const res = waitApi(page, 'POST', /\/pairings$/);
  await button(d, '作成する').click();
  expect((await res).ok()).toBeTruthy();
  await expect(page.getByText('組合せ表を作成しました')).toBeVisible();
  await expect(button(page, '大会を開催する')).toBeEnabled();
}

/** A3〜A5共通「大会を開催する」（または「大会を閲覧する」）でA6を開く */
export async function openPairingsPage(page: Page, label: '大会を開催する' | '大会を閲覧する' = '大会を開催する') {
  await button(page, label).click();
  await page.waitForURL(/\/pairings$/);
  await expect(page.getByRole('link', { name: '組合せ・スコア表', exact: true })).toBeVisible();
}

/** A3〜A5共通「大会を終了する」→「終了する」 */
export async function finishTournament(page: Page) {
  await button(page, '大会を終了する').click();
  const d = dialog(page, '大会を終了しますか？');
  await expect(d).toContainText(
    '大会を終了すると、大会情報・競技情報・選手情報の編集、スコアの入力・修正、順位表の作成、順位の手動確定（じゃんけん結果の確定）ができなくなります。終了しますか？',
  );
  const res = waitApi(page, 'PUT', /\/status$/);
  await button(d, '終了する').click();
  expect((await res).ok()).toBeTruthy();
  await expect(page.getByText('終了', { exact: true })).toBeVisible();
}

/** A3〜A5共通「大会を再開する」→「再開する」 */
export async function restartTournament(page: Page) {
  await button(page, '大会を再開する').click();
  const res = waitApi(page, 'PUT', /\/status$/);
  await button(dialog(page, '大会を再開しますか？'), '再開する').click();
  expect((await res).ok()).toBeTruthy();
  await expect(page.getByText('進行中', { exact: true })).toBeVisible();
}

// ---------- A4 競技情報 ----------

/** A4で競技情報を入力して保存する */
export async function saveCompetition(page: Page, c: E2ECompetition) {
  await expect(page.getByText('競技情報が未登録です。内容を確認して「保存」してください。')).toBeVisible();
  // デフォルト値（要件定義書3.2）
  await expect(page.getByLabel('ラウンド数')).toHaveValue('1');
  await expect(page.getByRole('checkbox', { name: '変換あり' })).toBeChecked();
  await expect(page.getByLabel('ホールインワン時のスコア変換値')).toHaveValue('-2');
  await expect(page.getByLabel('パーティの最大人数')).toHaveValue('6');
  await expect(page.getByRole('checkbox', { name: 'チーム戦あり' })).not.toBeChecked();

  await page.getByLabel('ラウンド数').selectOption(String(c.rounds));
  await page.getByRole('checkbox', { name: '変換あり' }).setChecked(c.holeInOne);
  if (c.holeInOne) {
    await page.getByLabel('ホールインワン時のスコア変換値').selectOption(String(c.holeInOneValue));
  } else {
    await expect(page.getByLabel('ホールインワン時のスコア変換値')).toBeDisabled();
    await expect(page.getByText('「変換あり」の場合のみ入力できます')).toBeVisible();
  }
  await page.getByLabel('パーティの最大人数').selectOption(String(c.maxPartySize));
  await page.getByRole('radio', { name: c.method, exact: true }).check();
  await page.getByRole('checkbox', { name: 'チーム戦あり' }).setChecked(c.teamBattle);
  if (c.teamBattle && c.teamMethod) {
    await page.getByRole('radio', { name: c.teamMethod, exact: true }).check();
  } else {
    await expect(page.getByText('「チーム戦あり」の場合のみ選択できます')).toBeVisible();
  }
  const res = waitApi(page, 'PUT', /\/competition$/);
  await button(page, '保存').click();
  expect((await res).ok()).toBeTruthy();
  await expect(page.getByRole('status')).toHaveText('保存しました');
}

// ---------- A5 選手情報 ----------

/** A5の選手の行（選手名で特定する。サンプルの選手名は互いに部分一致しないように定義している） */
export const playerRow = (page: Page, name: string): Locator =>
  page.getByTestId('player-row').filter({ hasText: name });

/**
 * A5「+ 新規登録」→「追加して続けて登録」で選手を続けて一覧へ追加し、不参加を設定して「保存」する。
 * 生年月日は入力欄の下に西暦（「→ YYYY/MM/DD」）が表示されることを確認してから追加する。
 */
export async function registerPlayers(page: Page, players: E2EPlayer[]) {
  await expect(page.getByText('選手が登録されていません')).toBeVisible();
  await button(page, '+ 新規登録').click();
  const d = dialog(page, '選手情報の新規登録');
  await expect(d).toContainText('※一覧の「保存」ボタンを押すまでサーバーには反映されません。');
  for (const p of players) {
    const name = p.typoName ?? p.name;
    await d.getByLabel('選手名', { exact: true }).fill(name);
    await d.getByLabel('生年月日', { exact: true }).fill(p.birthInput);
    await expect(d.getByText(`→ ${p.birthDisplay}`, { exact: true })).toBeVisible();
    // チーム名・パーティ固定・パーティ番号は直前の値が引き継がれるため、毎回明示的に設定する
    await d.getByLabel('チーム名', { exact: true }).fill(p.teamName);
    await d.getByRole('checkbox', { name: '固定', exact: true }).setChecked(p.fixedParty !== undefined);
    if (p.fixedParty !== undefined) {
      await d.getByLabel('パーティ番号', { exact: true }).fill(String(p.fixedParty));
    } else {
      await expect(d.getByLabel('パーティ番号', { exact: true })).toBeDisabled();
    }
    await button(d, '追加して続けて登録').click();
    await expect(d.getByRole('status')).toHaveText(`「${name}」を一覧に追加しました。続けて入力できます。`);
    await expect(d.getByLabel('選手名', { exact: true })).toHaveValue('');
  }
  // 追加後はキャンセルボタンが「閉じる」になる（右上の✕も「閉じる」のため、フッターの最後のボタンを押す）
  await d.getByRole('button', { name: '閉じる', exact: true }).last().click();
  await expect(d).toBeHidden();

  for (const p of players.filter((x) => x.absent)) {
    await button(playerRow(page, p.name), '不参加').click();
    await expect(playerRow(page, p.name)).toHaveAttribute('data-absent', 'true');
  }
  await expect(page.getByText('未保存の変更があります')).toBeVisible();
  await savePlayers(page);
  await expect(page.getByTestId('player-row')).toHaveCount(players.length);
}

/** A5「保存」（組合せ表のリセット確認が出る場合は confirmReset で「変更する」を押す） */
export async function savePlayers(page: Page, opts: { confirmReset?: boolean } = {}) {
  const first = waitApi(page, 'PUT', /\/players$/);
  await button(page, '保存').click();
  const res = await first;
  if (opts.confirmReset) {
    expect(res.status()).toBe(409);
    const d = dialog(page, '組合せ表・スコア表の削除確認');
    await expect(d).toContainText('既存の組合せ表・スコア表を削除し、再生成が必要になります。変更しますか？');
    const second = waitApi(page, 'PUT', /\/players$/);
    await button(d, '変更する').click();
    expect((await second).ok()).toBeTruthy();
    await expect(page.getByRole('status')).toHaveText('保存しました（組合せ表・スコア表を削除しました）');
  } else {
    expect(res.ok()).toBeTruthy();
    await expect(page.getByRole('status')).toHaveText('保存しました');
  }
}

/** A5の一覧の表示（生年月日は西暦・チーム名未入力は「-」・固定/非固定・パーティ番号） */
export async function expectPlayerRows(page: Page, players: E2EPlayer[]) {
  for (const p of players) {
    const row = playerRow(page, p.name);
    const cells = row.getByRole('cell');
    await expect(cells.nth(1)).toHaveText(p.birthDisplay);
    await expect(cells.nth(2)).toHaveText(p.teamName || '-');
    await expect(cells.nth(3)).toHaveText(p.fixedParty !== undefined ? '固定' : '非固定');
    await expect(cells.nth(4)).toHaveText(p.fixedParty !== undefined ? String(p.fixedParty) : '-');
    if (p.absent) {
      await expect(row).toHaveAttribute('data-absent', 'true');
      await expect(cells.nth(0)).toHaveText(`${p.name}不参加`);
      await expect(button(row, '参加に戻す')).toBeVisible();
    } else {
      await expect(row).not.toHaveAttribute('data-absent', 'true');
    }
  }
}

/** 大会・競技情報・選手を画面操作で登録する（E2E-02〜04の前半で共通） */
export async function registerDataset(page: Page, data: E2EDataset): Promise<string> {
  const id = await createTournament(page, data.tournament);
  await openTab(page, '競技情報');
  await saveCompetition(page, data.competition);
  await openTab(page, '選手情報');
  await registerPlayers(page, data.players);
  await expectPlayerRows(page, data.players);
  return id;
}

// ---------- A6 組合せ・スコア表 ----------

/** A6のパーティ（tbody） */
export const partyBody = (page: Page, partyNumber: number): Locator => page.getByTestId(`party-${partyNumber}`);

export type PartyView = { partyNumber: number; startGroup: number; startHole: number; members: string[] };

/** A6の表示からパーティ番号・開始グループ・開始ホール・選手名（ラウンド1行の data-testid）を読み取る */
export async function readParties(page: Page): Promise<PartyView[]> {
  return page.locator('tbody[data-testid^="party-"]').evaluateAll((bodies) =>
    bodies.map((b) => ({
      partyNumber: Number((b.getAttribute('data-testid') ?? '').replace('party-', '')),
      startGroup: Number(b.querySelector('[data-testid="start-group"]')?.textContent),
      startHole: Number(b.querySelector('[data-testid="start-hole"]')?.textContent),
      members: [...b.querySelectorAll('tr[data-testid^="row-"][data-testid$="-1"]')].map((tr) =>
        (tr.getAttribute('data-testid') ?? '').slice('row-'.length, -'-1'.length),
      ),
    })),
  );
}

/** パーティ内の「ラウンドn：未入力／入力済」ボタン */
export const roundButton = (page: Page, partyNumber: number, round: number): Locator =>
  partyBody(page, partyNumber).getByRole('button', { name: new RegExp(`^ラウンド${round}：`) });

/**
 * スコア入力ダイアログを開き、ダイアログに並ぶ選手ごとに8ホール分を入力して保存する。
 * 入力する打数は選手名で引き当てる（シャッフルの組合せ表はランダムなため）。
 */
export async function enterRoundScores(
  page: Page,
  partyNumber: number,
  round: number,
  scores: Record<string, number[][]>,
) {
  await roundButton(page, partyNumber, round).click();
  const d = dialog(page, `パーティ${partyNumber} ラウンド${round} スコア入力`);
  await expect(d).toContainText('8ホール分をまとめて保存します（ホール単位の部分保存はできません）。');
  const names = (await d.locator('tbody tr td:first-child').allTextContents()).map((s) => s.trim());
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    const holes = scores[name]?.[round - 1];
    if (!holes) throw new Error(`サンプルデータに ${name} のラウンド${round}のスコアがありません`);
    for (let h = 1; h <= 8; h++) {
      await d.getByLabel(`${name} ホール${h}`, { exact: true }).fill(String(holes[h - 1]));
    }
  }
  const res = waitApi(page, 'PUT', /\/scores$/);
  await button(d, '保存').click();
  expect((await res).ok()).toBeTruthy();
  await expect(d).toBeHidden();
  await expect(roundButton(page, partyNumber, round)).toContainText('入力済');
}

/** 全パーティ・全ラウンドのスコアを入力する */
export async function enterAllScores(page: Page, rounds: number, scores: Record<string, number[][]>) {
  const parties = await readParties(page);
  for (const party of parties) {
    for (let r = 1; r <= rounds; r++) {
      await enterRoundScores(page, party.partyNumber, r, scores);
    }
  }
}

/** A6の選手のラウンド行 */
export const scoreRow = (page: Page, name: string, round: number): Locator => page.getByTestId(`row-${name}-${round}`);

// ---------- A7 順位表 ----------

/** 大会運営タブの「順位表」へ移動する */
export async function openRankingsTab(page: Page) {
  await page.getByRole('link', { name: '順位表', exact: true }).click();
  await page.waitForURL(/\/rankings$/);
}

/** 「順位表作成」を押し、集計結果が表示されるのを待つ */
export async function generateRankings(page: Page) {
  const res = waitApi(page, 'POST', /\/rankings$/);
  await button(page, '順位表作成').click();
  expect((await res).ok()).toBeTruthy();
  await expect(page.getByText(/^作成日時：\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/)).toBeVisible();
}

/** 順位表の各行のセル（テキスト）を読み取る */
export async function readTableRows(page: Page, testId: 'individual-row' | 'team-row'): Promise<string[][]> {
  return page
    .getByTestId(testId)
    .evaluateAll((rows) =>
      rows.map((tr) => [...tr.querySelectorAll('td')].map((td) => (td.textContent ?? '').trim())),
    );
}

/** 個人戦順位表の [順位, 選手名, 総合スコア, じゃんけん待ち] */
export async function readIndividualRanking(page: Page): Promise<[number, string, number, boolean][]> {
  const rows = await readTableRows(page, 'individual-row');
  return rows.map((c) => [Number(c[0]), c[1], Number(c[3]), c[5].includes('じゃんけん待ち')]);
}

/** 順位表の行（選手名・チーム名で特定する） */
export const rankingRow = (page: Page, testId: 'individual-row' | 'team-row', name: string): Locator =>
  page.getByTestId(testId).filter({ has: page.getByRole('cell', { name, exact: true }) });

/** じゃんけん待ちの行の「手動確定」で順位を確定する。error を指定した場合はそのエラーが出ることを確認する */
export async function confirmManualRank(
  page: Page,
  row: Locator,
  label: string,
  range: [number, number],
  rank: number,
  error?: string,
) {
  await button(row, '手動確定').click();
  const d = dialog(page, `${label} の最終順位を手動確定`);
  await expect(d).toContainText(`確定する順位（${range[0]}〜${range[1]}）`);
  await d.getByLabel('確定する順位').fill(String(rank));
  const res = waitApi(page, 'PUT', /\/rankings\/manual$/);
  await button(d, '確定する').click();
  const r = await res;
  if (error) {
    expect(r.ok()).toBeFalsy();
    await expect(d.getByText(error, { exact: true })).toBeVisible();
    await button(d, 'キャンセル').click();
    await expect(d).toBeHidden();
    return;
  }
  expect(r.ok()).toBeTruthy();
  await expect(d).toBeHidden();
}

// ---------- A8 バックアップ ----------

/** 共通ヘッダー「バックアップ」でA8を開く */
export async function openBackupPage(page: Page) {
  await button(page, 'バックアップ').click();
  await page.waitForURL(/\/settings\/backup$/);
  await expect(page.getByRole('heading', { name: 'バックアップ・リストア' })).toBeVisible();
}
