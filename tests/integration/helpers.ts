// 結合テスト共通ヘルパー
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ADMIN = { id: 'admin', password: 'password123' };

export const COMPETITION = {
  rounds: 1,
  holeInOneConversionEnabled: true,
  holeInOneConversionValue: -2,
  maxPartySize: 6,
  partyAssignmentMethod: 'チーム',
  teamBattleEnabled: false,
  teamRankingMethod: null,
};

export type PlayerInput = {
  id?: string;
  name: string;
  birthDate: string;
  teamName: string;
  partyFixed: boolean;
  partyNumber: number | null;
  absent?: boolean;
};

export const P = (name: string, teamName = '東', birthDate = '1970/01/01', extra: Partial<PlayerInput> = {}): PlayerInput => ({
  name,
  birthDate,
  teamName,
  partyFixed: false,
  partyNumber: null,
  ...extra,
});

/** 8ホール合計が total になる打数（ホールインワンを含まない） */
export const H = (total: number) => [total - 14, 2, 2, 2, 2, 2, 2, 2];

export async function loginAdmin(page: Page) {
  const res = await page.request.post('/api/auth/login', { data: ADMIN });
  expect(res.ok()).toBeTruthy();
}

export async function loginViewer(page: Page) {
  const res = await page.request.post('/api/auth/viewer-login');
  expect(res.ok()).toBeTruthy();
}

async function json(res: Awaited<ReturnType<APIRequestContext['get']>>) {
  const body = await res.json();
  if (!res.ok()) throw new Error(`${res.status()} ${JSON.stringify(body)}`);
  return body.data;
}

let counter = 0;
export function uniqueName(prefix = '大会') {
  counter += 1;
  return `${prefix}${Date.now() % 100000}-${counter}`;
}

export async function createTournament(request: APIRequestContext, patch: Record<string, unknown> = {}) {
  return json(
    await request.post('/api/tournaments', {
      data: { name: uniqueName(), date: '2026-11-16', place: 'グラウンド', ...patch },
    }),
  ) as Promise<{ id: string; name: string }>;
}

export async function saveCompetition(request: APIRequestContext, id: string, patch: Record<string, unknown> = {}, confirmReset = false) {
  return json(await request.put(`/api/tournaments/${id}/competition`, { data: { competition: { ...COMPETITION, ...patch }, confirmReset } }));
}

export async function savePlayers(request: APIRequestContext, id: string, players: PlayerInput[], confirmReset = false) {
  return json(await request.put(`/api/tournaments/${id}/players`, { data: { players, confirmReset } })) as Promise<
    (PlayerInput & { id: string; birthDate: string })[]
  >;
}

export async function generate(request: APIRequestContext, id: string) {
  return json(await request.post(`/api/tournaments/${id}/pairings`)) as Promise<
    { partyNumber: number; startHole: number; playerIds: string[] }[]
  >;
}

export async function getDetail(request: APIRequestContext, id: string) {
  return json(await request.get(`/api/tournaments/${id}`));
}

export async function saveScores(
  request: APIRequestContext,
  id: string,
  partyNumber: number,
  round: number,
  scores: Record<string, number[]>,
) {
  return json(await request.put(`/api/tournaments/${id}/scores`, { data: { partyNumber, round, scores } }));
}

/** 大会・競技情報・選手を登録し、必要に応じて組合せ表を生成する */
export async function setupTournament(
  request: APIRequestContext,
  opts: { competition?: Record<string, unknown>; players?: PlayerInput[]; pairings?: boolean; tournament?: Record<string, unknown> } = {},
) {
  const t = await createTournament(request, opts.tournament);
  await saveCompetition(request, t.id, opts.competition);
  const players = await savePlayers(request, t.id, opts.players ?? [P('Aさん'), P('Bさん'), P('Cさん', '西')]);
  const parties = opts.pairings ? await generate(request, t.id) : [];
  const byName = Object.fromEntries(players.map((p) => [p.name, p.id]));
  return { id: t.id, name: t.name, players, parties, byName };
}

export const asInput = (p: PlayerInput & { id: string }) => ({
  id: p.id,
  name: p.name,
  birthDate: p.birthDate.replace(/-/g, '/'),
  teamName: p.teamName,
  partyFixed: p.partyFixed,
  partyNumber: p.partyNumber,
  absent: p.absent ?? false,
});
