// サンプルデータによるバリエーション（docs/結合テスト.md「11. サンプルデータによるバリエーション」）
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { COMPETITION, loginAdmin, uniqueName } from './helpers';
import { SAMPLES, type Sample } from './fixtures/samples';
import { seedSample, type Seeded } from './fixtures/seed';

test.beforeEach(async ({ page }) => loginAdmin(page));

type Row = { rank: number; jankenPending: boolean; totalScore: number };
type IndividualRow = Row & { playerId: string; playerName: string };
type TeamRow = Row & { teamName: string; memberCount: number };
type Snapshot = { individual: IndividualRow[]; team: TeamRow[] | null; excludedPlayerNames: string[] };

const byRankName = <T extends [number, string, ...unknown[]]>(rows: T[]) =>
  [...rows].sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));

async function createRanking(request: APIRequestContext, id: string) {
  const started = Date.now();
  const res = await request.post(`/api/tournaments/${id}/rankings`);
  const ms = Date.now() - started;
  expect(res.status()).toBe(201);
  return { snapshot: (await res.json()).data as Snapshot, ms };
}

async function manual(request: APIRequestContext, id: string, target: Record<string, string>, rank: number) {
  return request.put(`/api/tournaments/${id}/rankings/manual`, { data: { target, rank } });
}

/** [A6] パーティの表示順（パーティ番号） */
const partyOrder = (page: Page) =>
  page
    .locator('tbody[data-testid^="party-"]')
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-testid')?.replace('party-', ''))));

/** サンプルごとの追加検証 */
const EXTRA: Record<string, (page: Page, s: Seeded) => Promise<void>> = {
  // じゃんけん待ちの手動確定：グループの範囲外・確定済みの順位との重複はエラー。確定後に再作成するとじゃんけん待ちに戻る
  'I-VAR-21': async (page, s) => {
    const r = page.request;
    const ind = (name: string) => ({ kind: 'individual', playerId: s.byName[name] });
    expect((await manual(r, s.id, ind('先頭'), 1)).status()).toBe(400); // じゃんけん待ちではない
    expect((await manual(r, s.id, ind('甲'), 5)).status()).toBe(400); // 範囲（2〜4）外
    expect((await manual(r, s.id, ind('丙'), 2)).ok()).toBe(true);
    expect((await manual(r, s.id, ind('甲'), 3)).ok()).toBe(true);
    const dup = await manual(r, s.id, ind('乙'), 3);
    expect(dup.status()).toBe(400);
    expect((await dup.json()).error.message).toBe('3位は同じグループ内で既に確定済みです');
    expect((await manual(r, s.id, ind('乙'), 4)).ok()).toBe(true);
    expect((await manual(r, s.id, ind('己'), 6)).ok()).toBe(true);
    expect((await manual(r, s.id, ind('戊'), 7)).ok()).toBe(true);
    await page.goto(`/tournaments/${s.id}/rankings`);
    await expect(page.getByText('じゃんけん待ち')).toHaveCount(0);
    const names = await page.getByTestId('individual-row').evaluateAll((rows) =>
      rows.map((row) => [row.querySelectorAll('td')[0].textContent, row.querySelectorAll('td')[1].textContent].join(':')),
    );
    expect(names).toEqual(['1:先頭', '2:丙', '3:甲', '4:乙', '5:丁', '6:己', '7:戊']);
    // 手動確定は記憶しないため、順位表作成の再実行でスコアから再集計され、じゃんけん待ちに戻る（要件定義書3.7）
    await page.getByRole('button', { name: '順位表作成' }).click();
    await expect(page.getByText('じゃんけん待ち')).toHaveCount(5);
  },
  // チーム戦のじゃんけん待ちを[A7]で手動確定する
  'I-VAR-09': async (page, s) => {
    await page.goto(`/tournaments/${s.id}/rankings`);
    const team = page.getByTestId('team-row');
    await expect(team.filter({ hasText: 'じゃんけん待ち' })).toHaveCount(2);
    await team.filter({ hasText: '桜' }).getByRole('button', { name: '手動確定' }).click();
    const dialog = page.getByRole('dialog', { name: '桜 の最終順位を手動確定' });
    await expect(dialog).toContainText('確定する順位（3〜4）');
    await dialog.getByLabel('確定する順位').fill('3');
    await dialog.getByRole('button', { name: '確定する' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(team.filter({ hasText: 'じゃんけん待ち' })).toHaveCount(1);
    await expect(team.nth(2)).toContainText('桜');
    await expect(team.nth(3)).toContainText('梅');
  },
  // 性能（要件定義書4章）：組合せ表生成・順位表作成とも3秒以内。[A6]に24パーティを表示する
  'I-VAR-14': async (page, s) => {
    expect(s.generateMs).toBeLessThan(3000);
    const { ms } = await createRanking(page.request, s.id);
    expect(ms).toBeLessThan(3000);
    await page.goto(`/tournaments/${s.id}/pairings`);
    await expect(page.getByTestId('start-group')).toHaveCount(24);
    await expect(page.getByTestId('start-group')).toHaveText(Array.from({ length: 24 }, (_, i) => String((i % 3) + 1)));
  },
  // 20パーティの開始グループ（同じ開始ホール内の順番）と、開始ホール降順の並べ替え
  'I-VAR-11': async (page, s) => {
    await page.goto(`/tournaments/${s.id}/pairings`);
    await expect(page.getByTestId('start-group')).toHaveText(
      Array.from({ length: 20 }, (_, i) => String((i % 3) + 1)),
    );
    const startHole = page.getByRole('button', { name: /開始ホール/ });
    await startHole.click();
    await startHole.click(); // 降順（同じ開始ホールはパーティ番号順）
    expect(await partyOrder(page)).toEqual([19, 20, 16, 17, 18, 13, 14, 15, 10, 11, 12, 7, 8, 9, 4, 5, 6, 1, 2, 3]);
  },
  // 生年月日は[A5]に西暦（YYYY/MM/DD）で表示される
  'I-VAR-17': async (page, s) => {
    await page.goto(`/tournaments/${s.id}/players`);
    await expect(page.getByTestId('player-row').filter({ hasText: '昭和元年初日' })).toContainText('1926/12/25');
    await expect(page.getByTestId('player-row').filter({ hasText: '平成初日' })).toContainText('1989/01/08');
    await expect(page.getByTestId('player-row').filter({ hasText: '前後空白' })).toContainText('1950/01/01');
  },
  // 文字数上限ちょうどの大会名・開催場所・選手名・チーム名がそのまま保存・表示される
  'I-VAR-34': async (page, s) => {
    const sample = SAMPLES.find((x) => x.id === 'I-VAR-34') as Sample;
    const d = (await (await page.request.get(`/api/tournaments/${s.id}`)).json()).data;
    expect(d.tournament.name).toBe(sample.tournament?.name);
    expect(d.tournament.place).toBe(sample.tournament?.place);
    await page.goto('/tournaments');
    await expect(page.getByTestId('tournament-row').filter({ hasText: sample.tournament?.name as string })).toHaveCount(1);
    await page.goto(`/tournaments/${s.id}/pairings`);
    await expect(page.getByRole('heading', { level: 1, name: sample.tournament?.name })).toBeVisible();
    for (const p of sample.players) {
      await expect(page.getByTestId(`row-${p.name}-1`)).toContainText(p.teamName);
    }
    await page.goto(`/tournaments/${s.id}/rankings`);
    await expect(page.getByTestId('team-row').first()).toContainText('𩸽𩸽チーム１２３４５');
    await expect(page.getByTestId('individual-row').first()).toContainText('𠮷田𠮷子さん一二三四');
  },
};

test.describe('11. サンプルデータによるバリエーション', () => {
  for (const sample of SAMPLES) {
    test(`${sample.id} ${sample.title}`, async ({ page }) => {
      const r = page.request;
      const s = await seedSample(r, sample);
      const ex = sample.expect;

      if (ex.pairingError) {
        expect(s.pairingError).toEqual({ status: 400, code: 'PAIRING_ERROR', message: ex.pairingError });
        expect((await (await r.get(`/api/tournaments/${s.id}`)).json()).data.parties).toHaveLength(0);
        return;
      }
      expect(s.pairingError).toBeUndefined();

      // 組合せ表（パーティ編成・開始ホール）
      const allIds = s.parties.flatMap((p) => p.playerIds);
      expect(new Set(allIds).size).toBe(allIds.length); // 同じ選手が複数パーティに入らない
      const participants = s.players.filter((p) => !p.absent).map((p) => p.id);
      expect([...allIds].sort()).toEqual([...participants].sort()); // 不参加以外の全選手が1回ずつ
      const max = (sample.competition.maxPartySize as number | undefined) ?? COMPETITION.maxPartySize;
      for (const p of s.parties) expect(p.playerIds.length).toBeLessThanOrEqual(max);
      // 固定選手は指定のパーティ番号
      for (const p of sample.players.filter((x) => x.partyFixed && !x.absent)) {
        const party = s.parties.find((x) => x.playerIds.includes(s.byName[p.name]));
        expect(party?.partyNumber, p.name).toBe(p.partyNumber);
      }
      if (ex.parties) expect(s.parties.map((p) => [p.partyNumber, p.playerIds.length])).toEqual(ex.parties);
      if (ex.startHoles) expect(s.parties.map((p) => p.startHole)).toEqual(ex.startHoles);
      for (const [num, names] of Object.entries(ex.members ?? {})) {
        const party = s.parties.find((p) => p.partyNumber === Number(num));
        expect(party, `パーティ${num}`).toBeTruthy();
        for (const n of names) expect(party?.playerIds, n).toContain(s.byName[n]);
      }
      if (ex.birthDates) {
        for (const [n, iso] of Object.entries(ex.birthDates)) {
          expect(s.players.find((p) => p.name === n)?.birthDate, n).toBe(iso);
        }
      }

      // [A6] パーティ数・開始ホール・年齢・ホールセル
      await page.goto(`/tournaments/${s.id}/pairings`);
      await expect(page.locator('tbody[data-testid^="party-"]')).toHaveCount(s.parties.length);
      await expect(page.getByTestId('start-hole')).toHaveText(s.parties.map((p) => String(p.startHole)));
      for (const [n, age] of Object.entries(ex.ages ?? {})) {
        await expect(page.getByTestId(`row-${n}-1`), n).toContainText(age);
      }
      for (const [n, cells] of Object.entries(ex.cells ?? {})) {
        await expect(page.getByTestId(`row-${n}-1`).getByTestId('hole-cell'), n).toHaveText(cells);
      }

      // 順位表
      if (sample.scores) {
        const { snapshot } = await createRanking(r, s.id);
        if (ex.individualCount !== undefined) expect(snapshot.individual).toHaveLength(ex.individualCount);
        if (ex.individual) {
          const actual = snapshot.individual.map(
            (x) => [x.rank, x.playerName, x.totalScore, x.jankenPending] as [number, string, number, boolean],
          );
          const expected = byRankName(ex.individual.map(([rank, n, total, p]) => [rank, n, total, p ?? false] as [number, string, number, boolean]));
          if (ex.individualCount !== undefined && ex.individualCount > ex.individual.length) {
            expect(actual.slice(0, ex.individual.length)).toEqual(expected);
          } else {
            expect(byRankName(actual)).toEqual(expected);
          }
          // 順位は総合スコアの昇順
          const totals = snapshot.individual.map((x) => x.totalScore);
          expect(totals).toEqual([...totals].sort((a, b) => a - b));
        }
        if (ex.team) {
          const actual = (snapshot.team ?? []).map(
            (x) => [x.rank, x.teamName, x.memberCount, x.totalScore, x.jankenPending] as [number, string, number, number, boolean],
          );
          expect(byRankName(actual)).toEqual(
            byRankName(ex.team.map(([rank, n, c, total, p]) => [rank, n, c, total, p ?? false] as [number, string, number, number, boolean])),
          );
        } else if (!sample.competition.teamBattleEnabled) {
          expect(snapshot.team).toBeNull();
        }
        if (ex.excluded) expect(snapshot.excludedPlayerNames).toEqual(ex.excluded);

        // [A7] 表示
        await page.goto(`/tournaments/${s.id}/rankings`);
        await expect(page.getByTestId('individual-row')).toHaveCount(snapshot.individual.length);
        if (ex.excluded && ex.excluded.length > 0) {
          await expect(page.getByTestId('excluded')).toHaveText(
            `全ラウンド分のスコアが保存されていないため集計対象外：${ex.excluded.join('、')}`,
          );
        } else {
          await expect(page.getByTestId('excluded')).toHaveCount(0);
        }
        if (ex.teamRows) {
          const rows = await page
            .getByTestId('team-row')
            .evaluateAll((rs) => rs.map((row) => Array.from(row.querySelectorAll('td')).slice(0, 5).map((td) => td.textContent)));
          expect(rows).toEqual(ex.teamRows);
        }
      }

      await EXTRA[sample.id]?.(page, s);
    });
  }

  test('I-VAR-37 生年月日の不正な入力（元号の適用期間外・存在しない日付・形式違い）はAPIで拒否される', async ({ page }) => {
    const r = page.request;
    const t = (await (await r.post('/api/tournaments', { data: { name: uniqueName('I-VAR-37-'), date: '2026-11-16', place: 'x' } })).json()).data;
    await r.put(`/api/tournaments/${t.id}/competition`, { data: { competition: { ...COMPETITION, partyAssignmentMethod: 'シャッフル' } } });
    const invalid = [
      'S64.01.08', // 昭和の適用期間外
      'H31.05.01', // 平成の適用期間外
      'R1.04.30', // 令和の適用期間外
      'S1.12.24', // 昭和の開始前
      'H0.01.01', // 0年
      '1999/02/29', // 平年の2/29
      '2023/13/01', // 13月
      '2023/04/31', // 存在しない日
      '1971-05-24', // 区切りがハイフン
      'T10.01.01', // 大正は対象外
      '71/05/24', // 西暦2桁
      'S46/05/24', // 和暦の区切り違い
      '',
    ];
    for (const birthDate of invalid) {
      const res = await r.put(`/api/tournaments/${t.id}/players`, {
        data: { players: [{ name: 'Aさん', birthDate, teamName: '', partyFixed: false, partyNumber: null }] },
      });
      expect(res.status(), birthDate).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details['0'].birthDate, birthDate).toBeTruthy();
    }
    expect((await (await r.get(`/api/tournaments/${t.id}`)).json()).data.players).toHaveLength(0);
  });

  test('I-VAR-38 文字数上限+1（サロゲートペアは1文字として数える）はAPIで拒否され、自動で切り詰めない', async ({ page }) => {
    const r = page.request;
    const ng = await r.post('/api/tournaments', { data: { name: '𠮷'.repeat(51), date: '2026-11-16', place: '𩸽'.repeat(51) } });
    expect(ng.status()).toBe(400);
    const details = (await ng.json()).error.details;
    expect(details.name).toBe('大会名は50文字以内で入力してください');
    expect(details.place).toBe('開催場所は50文字以内で入力してください');
    const t = (await (await r.post('/api/tournaments', { data: { name: uniqueName('I-VAR-38-'), date: '2026-11-16', place: 'x' } })).json()).data;
    const res = await r.put(`/api/tournaments/${t.id}/players`, {
      data: {
        players: [
          { name: '𠮷'.repeat(10), birthDate: '1960/01/01', teamName: '𩸽'.repeat(10), partyFixed: false, partyNumber: null },
          { name: '𠮷'.repeat(11), birthDate: '1960/01/01', teamName: '𩸽'.repeat(11), partyFixed: false, partyNumber: null },
        ],
      },
    });
    expect(res.status()).toBe(400);
    const errors = (await res.json()).error.details;
    expect(errors['0']).toBeUndefined();
    expect(errors['1']).toEqual({ name: '選手名は10文字以内で入力してください', teamName: 'チーム名は10文字以内で入力してください' });
    expect((await (await r.get(`/api/tournaments/${t.id}`)).json()).data.players).toHaveLength(0);
  });

  test('I-VAR-39 チーム名未入力の選手がいる状態でパーティの決定方法を「チーム」に変更すると生成エラー（[A3]のエラーダイアログ）', async ({ page }) => {
    const r = page.request;
    const t = (await (await r.post('/api/tournaments', { data: { name: uniqueName('I-VAR-39-'), date: '2026-11-16', place: 'x' } })).json()).data;
    await r.put(`/api/tournaments/${t.id}/competition`, { data: { competition: { ...COMPETITION, partyAssignmentMethod: 'シャッフル' } } });
    await r.put(`/api/tournaments/${t.id}/players`, {
      data: {
        players: [
          { name: 'Aさん', birthDate: '1960/01/01', teamName: '東', partyFixed: false, partyNumber: null },
          { name: 'Bさん', birthDate: '1960/01/01', teamName: '', partyFixed: false, partyNumber: null },
        ],
      },
    });
    const changed = await r.put(`/api/tournaments/${t.id}/competition`, {
      data: { competition: { ...COMPETITION, partyAssignmentMethod: 'チーム' } },
    });
    expect(changed.ok()).toBe(true);
    await page.goto(`/tournaments/${t.id}`);
    await page.getByRole('button', { name: '組合せ表を作成する' }).click();
    await page.getByRole('button', { name: '作成する', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'エラー' }).getByRole('alert')).toHaveText(
      'チーム名が未入力の選手がいます。選手情報を見直してください。',
    );
    expect((await (await r.get(`/api/tournaments/${t.id}`)).json()).data.parties).toHaveLength(0);
  });
});
