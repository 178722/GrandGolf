// サンプル大会データ（samples.ts）をAPI経由で投入するヘルパー

import { expect, type APIRequestContext } from '@playwright/test';
import { COMPETITION, uniqueName } from '../helpers';
import type { Sample } from './samples';

type Party = { partyNumber: number; startHole: number; playerIds: string[] };
type SavedPlayer = { id: string; name: string; birthDate: string; absent: boolean };

export type Seeded = {
  id: string;
  name: string;
  players: SavedPlayer[];
  byName: Record<string, string>;
  nameById: Record<string, string>;
  parties: Party[];
  /** 組合せ表生成APIの所要時間（ms） */
  generateMs: number;
  pairingError?: { status: number; code: string; message: string };
};

async function data<T>(res: Awaited<ReturnType<APIRequestContext['get']>>, label: string): Promise<T> {
  const body = await res.json();
  expect(res.ok(), `${label}: ${res.status()} ${JSON.stringify(body)}`).toBe(true);
  return body.data as T;
}

/**
 * 大会・競技情報・選手を登録し、組合せ表を生成し、定義されたスコアを保存する。
 * スコアは、パーティ内の全選手分が定義されているラウンドだけを保存する（一部選手のみの保存はAPIで拒否されるため）。
 */
export async function seedSample(request: APIRequestContext, sample: Sample): Promise<Seeded> {
  const t = await data<{ id: string; name: string }>(
    await request.post('/api/tournaments', {
      data: { name: uniqueName(`${sample.id}-`), date: '2026-11-16', place: 'サンプル会場', ...sample.tournament },
    }),
    '大会登録',
  );
  await data(
    await request.put(`/api/tournaments/${t.id}/competition`, {
      data: { competition: { ...COMPETITION, ...sample.competition }, confirmReset: false },
    }),
    '競技情報登録',
  );
  const players = await data<SavedPlayer[]>(
    await request.put(`/api/tournaments/${t.id}/players`, { data: { players: sample.players, confirmReset: false } }),
    '選手登録',
  );
  const byName = Object.fromEntries(players.map((p) => [p.name, p.id]));
  const nameById = Object.fromEntries(players.map((p) => [p.id, p.name]));

  const started = Date.now();
  const genRes = await request.post(`/api/tournaments/${t.id}/pairings`);
  const generateMs = Date.now() - started;
  const genBody = await genRes.json();
  if (!genRes.ok()) {
    return {
      id: t.id,
      name: t.name,
      players,
      byName,
      nameById,
      parties: [],
      generateMs,
      pairingError: { status: genRes.status(), code: genBody.error.code, message: genBody.error.message },
    };
  }
  const parties = (genBody.data as Party[]).sort((a, b) => a.partyNumber - b.partyNumber);

  const rounds = (sample.competition.rounds as number | undefined) ?? COMPETITION.rounds;
  for (const party of parties) {
    for (let r = 1; r <= rounds; r++) {
      const holes = party.playerIds.map((pid) => sample.scores?.[nameById[pid]]?.[r - 1]);
      if (holes.some((h) => !h)) continue;
      const scores = Object.fromEntries(party.playerIds.map((pid, i) => [pid, holes[i]]));
      await data(
        await request.put(`/api/tournaments/${t.id}/scores`, { data: { partyNumber: party.partyNumber, round: r, scores } }),
        `スコア保存（パーティ${party.partyNumber} ラウンド${r}）`,
      );
    }
  }
  return { id: t.id, name: t.name, players, byName, nameById, parties, generateMs };
}
