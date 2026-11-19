// E2Eシナリオの前提データ（補助部分）をAPIで投入するヘルパー。
// 主要フロー（E2E-01〜04）は画面操作で登録するため使用しない。E2E-05（閲覧モード）・E2E-06（バックアップ・復元）で、
// 確認対象ではない前提データ（大会・競技情報・選手・組合せ表・スコア・順位表）を用意するためにのみ使う。

import { expect, type APIRequestContext } from '@playwright/test';
import { E2E_ADMIN } from '../fixtures/env';
import type { E2EDataset } from '../fixtures/samples';

type Party = { partyNumber: number; startHole: number; playerIds: string[] };
type SavedPlayer = { id: string; name: string };

async function data<T>(res: Awaited<ReturnType<APIRequestContext['get']>>, label: string): Promise<T> {
  const body = await res.json();
  expect(res.ok(), `${label}: ${res.status()} ${JSON.stringify(body)}`).toBe(true);
  return body.data as T;
}

/** 管理者としてログインする（request コンテキストに Cookie が保存される） */
export async function apiLogin(request: APIRequestContext) {
  await data(await request.post('/api/auth/login', { data: E2E_ADMIN }), '管理者ログイン');
}

export type Seeded = { id: string; byName: Record<string, string>; parties: Party[] };

/**
 * 大会・競技情報・選手を登録し、opts に応じて組合せ表の作成・全スコアの保存・順位表の作成まで行う。
 */
export async function seedDataset(
  request: APIRequestContext,
  ds: E2EDataset,
  opts: { pairings?: boolean; scores?: boolean; rankings?: boolean } = {},
): Promise<Seeded> {
  const t = await data<{ id: string }>(await request.post('/api/tournaments', { data: ds.tournament }), '大会登録');
  const c = ds.competition;
  await data(
    await request.put(`/api/tournaments/${t.id}/competition`, {
      data: {
        competition: {
          rounds: c.rounds,
          holeInOneConversionEnabled: c.holeInOne,
          holeInOneConversionValue: c.holeInOne ? c.holeInOneValue : null,
          maxPartySize: c.maxPartySize,
          partyAssignmentMethod: c.method,
          teamBattleEnabled: c.teamBattle,
          teamRankingMethod: c.teamBattle ? (c.teamMethod ?? null) : null,
        },
        confirmReset: false,
      },
    }),
    '競技情報登録',
  );
  const players = await data<SavedPlayer[]>(
    await request.put(`/api/tournaments/${t.id}/players`, {
      data: {
        players: ds.players.map((p) => ({
          name: p.name,
          birthDate: p.birthInput,
          teamName: p.teamName,
          partyFixed: p.fixedParty !== undefined,
          partyNumber: p.fixedParty ?? null,
          absent: p.absent ?? false,
        })),
        confirmReset: false,
      },
    }),
    '選手登録',
  );
  const byName = Object.fromEntries(players.map((p) => [p.name, p.id]));
  const nameById = Object.fromEntries(players.map((p) => [p.id, p.name]));
  if (!opts.pairings) return { id: t.id, byName, parties: [] };

  const parties = await data<Party[]>(await request.post(`/api/tournaments/${t.id}/pairings`), '組合せ表作成');
  if (opts.scores) {
    for (const party of parties) {
      for (let r = 1; r <= c.rounds; r++) {
        const scores = Object.fromEntries(
          party.playerIds.map((pid) => {
            const holes = ds.players.find((p) => p.name === nameById[pid])?.rounds?.[r - 1];
            if (!holes) throw new Error(`${nameById[pid]} のラウンド${r}のスコアがありません`);
            return [pid, holes];
          }),
        );
        await data(
          await request.put(`/api/tournaments/${t.id}/scores`, { data: { partyNumber: party.partyNumber, round: r, scores } }),
          `スコア保存（パーティ${party.partyNumber} ラウンド${r}）`,
        );
      }
    }
  }
  if (opts.rankings) await data(await request.post(`/api/tournaments/${t.id}/rankings`), '順位表作成');
  return { id: t.id, byName, parties };
}

/** 手動バックアップを1件作成する */
export async function seedBackup(request: APIRequestContext) {
  await data(await request.post('/api/backups'), '手動バックアップ');
}
