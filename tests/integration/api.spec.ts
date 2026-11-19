// 10. API共通（レスポンス形式・存在しないリソース・不正なリクエスト・大会情報/ステータスの境界値）
import { expect, test } from '@playwright/test';
import { createTournament, getDetail, loginAdmin, setupTournament, uniqueName } from './helpers';

test.beforeEach(async ({ page }) => loginAdmin(page));

test.describe('10. API共通', () => {
  test('I-API-01 存在しない大会に対する各APIは404 NOT_FOUND（{ error: { code, message } } 形式）', async ({ page }) => {
    const r = page.request;
    const id = 'unknown-tournament';
    const calls = [
      r.get(`/api/tournaments/${id}`),
      r.put(`/api/tournaments/${id}`, { data: { name: 'x', date: '2026-11-16', place: 'y' } }),
      r.delete(`/api/tournaments/${id}`),
      r.put(`/api/tournaments/${id}/status`, { data: { status: '終了' } }),
      r.put(`/api/tournaments/${id}/competition`, { data: { competition: {} } }),
      r.put(`/api/tournaments/${id}/players`, { data: { players: [] } }),
      r.post(`/api/tournaments/${id}/pairings`),
      r.put(`/api/tournaments/${id}/pairings/1/start-hole`, { data: { startHole: 1 } }),
      r.put(`/api/tournaments/${id}/scores`, { data: { partyNumber: 1, round: 1, scores: {} } }),
      r.delete(`/api/tournaments/${id}/scores`, { data: { partyNumber: 1, round: 1 } }),
      r.post(`/api/tournaments/${id}/rankings`),
      r.put(`/api/tournaments/${id}/rankings/manual`, { data: { target: { kind: 'individual', playerId: 'x' }, rank: 1 } }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status(), `${res.url()}`).toBe(404);
      const body = await res.json();
      expect(body.error.code, res.url()).toBe('NOT_FOUND');
      expect(typeof body.error.message).toBe('string');
      expect(body.data).toBeUndefined();
    }
    // 選手一覧の保存で、存在しない選手IDを指定した場合も404
    const t = await createTournament(r);
    const res = await r.put(`/api/tournaments/${t.id}/players`, {
      data: { players: [{ id: 'no-such-player', name: 'A', birthDate: '1960/01/01', teamName: '', partyFixed: false, partyNumber: null }] },
    });
    expect(res.status()).toBe(404);
  });

  test('I-API-02 不正なJSON・形式違いのボディは400 VALIDATION_ERROR で、データは変わらない', async ({ page }) => {
    const r = page.request;
    const t = await setupTournament(r, { pairings: true });
    const before = await getDetail(r, t.id);
    const headers = { 'content-type': 'application/json' };
    const calls = [
      r.post('/api/tournaments', { data: '{"name":', headers }),
      r.put(`/api/tournaments/${t.id}`, { data: 'not json', headers }),
      r.put(`/api/tournaments/${t.id}/players`, { data: { players: 'x' } }),
      r.put(`/api/tournaments/${t.id}/players`, { data: {} }),
      r.put(`/api/tournaments/${t.id}/scores`, { data: { round: 1, scores: {} } }),
      r.put(`/api/tournaments/${t.id}/status`, { data: { status: '中止' } }),
      r.put(`/api/tournaments/${t.id}/status`, { data: {} }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status(), res.url()).toBe(400);
      expect((await res.json()).error.code, res.url()).toBe('VALIDATION_ERROR');
    }
    expect(await getDetail(r, t.id)).toEqual(before);
  });

  test('I-API-03 成功時は { data } 形式で、作成系（大会・組合せ表・順位表・バックアップ）は201、それ以外は200', async ({ page }) => {
    const r = page.request;
    const created = await r.post('/api/tournaments', { data: { name: uniqueName(), date: '2026-11-16', place: 'x' } });
    expect(created.status()).toBe(201);
    const t = (await created.json()).data;
    expect(t).toMatchObject({ status: '進行中', date: '2026-11-16', place: 'x' });
    expect(typeof t.id).toBe('string');
    const comp = await r.put(`/api/tournaments/${t.id}/competition`, {
      data: { competition: { rounds: 1, holeInOneConversionEnabled: true, holeInOneConversionValue: -2, maxPartySize: 6, partyAssignmentMethod: 'シャッフル', teamBattleEnabled: false, teamRankingMethod: null } },
    });
    expect(comp.status()).toBe(200);
    const players = await r.put(`/api/tournaments/${t.id}/players`, {
      data: {
        players: [
          { name: 'A', birthDate: '1960/01/01', teamName: '', partyFixed: false, partyNumber: null },
          { name: 'B', birthDate: '1960/01/01', teamName: '', partyFixed: false, partyNumber: null },
        ],
      },
    });
    expect(players.status()).toBe(200);
    expect((await players.json()).data).toHaveLength(2);
    expect((await r.post(`/api/tournaments/${t.id}/pairings`)).status()).toBe(201);
    expect((await r.post(`/api/tournaments/${t.id}/rankings`)).status()).toBe(201);
    expect((await r.post('/api/backups')).status()).toBe(201);
    const list = await r.get('/api/tournaments');
    expect(list.status()).toBe(200);
    expect(Object.keys(await list.json())).toEqual(['data']);
    expect((await r.delete(`/api/tournaments/${t.id}`)).status()).toBe(200);
  });

  test('I-API-04 大会情報の境界値：開催日は実在する日付（うるう日可）のみ、前後の空白は除去して保存、ステータスは「進行中」「終了」のみ', async ({ page }) => {
    const r = page.request;
    for (const date of ['2028-02-29', '2026-12-31', '2026-01-01']) {
      expect((await r.post('/api/tournaments', { data: { name: uniqueName(), date, place: 'x' } })).status(), date).toBe(201);
    }
    for (const date of ['2026-02-29', '2026-13-01', '2026/11/16', '2026-11-1', '']) {
      const res = await r.post('/api/tournaments', { data: { name: uniqueName(), date, place: 'x' } });
      expect(res.status(), date).toBe(400);
      expect(Object.keys((await res.json()).error.details), date).toEqual(['date']);
    }
    const spaced = (await (await r.post('/api/tournaments', { data: { name: '  空白大会  ', date: '2026-11-16', place: ' 会場 ' } })).json()).data;
    expect(spaced).toMatchObject({ name: '空白大会', place: '会場' });
    const blank = await r.post('/api/tournaments', { data: { name: '   ', date: '2026-11-16', place: '　' } });
    expect(blank.status()).toBe(400);
    expect(Object.keys((await blank.json()).error.details).sort()).toEqual(['name', 'place']);
    // ステータスは何度でも切り替えられる
    for (const status of ['終了', '進行中', '終了']) {
      const res = await r.put(`/api/tournaments/${spaced.id}/status`, { data: { status } });
      expect((await res.json()).data.status).toBe(status);
    }
  });
});
