import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackup, listBackups, MAX_BACKUPS, restoreBackup } from './backup';
import { loadDb, updateDb } from './db';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'gg-bk-'));
  process.env.GRANDGOLF_DATA_DIR = dir;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function setName(name: string) {
  await updateDb((db) => {
    db.tournaments = [{ id: 't1', name, date: '2026-11-16', place: 'x', status: '進行中', createdAt: '2026-11-16T00:00:00Z' }];
  });
}

describe('バックアップ・リストア（要件定義書4章）', () => {
  it('U-BK-01 契機付きで作成され、新しい順に一覧される', async () => {
    await createBackup('手動', new Date('2026-11-16T10:00:00Z'));
    await createBackup('ログアウト', new Date('2026-11-16T11:00:00Z'));
    const list = await listBackups();
    expect(list.map((b) => [b.trigger, b.createdAt])).toEqual([
      ['ログアウト', '2026-11-16T11:00:00.000Z'],
      ['手動', '2026-11-16T10:00:00.000Z'],
    ]);
  });

  it('U-BK-02 保持数は20件で、超過時は最も古いものから削除する', async () => {
    for (let i = 0; i <= MAX_BACKUPS; i++) {
      await createBackup('手動', new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
    }
    const list = await listBackups();
    expect(MAX_BACKUPS).toBe(20);
    expect(list).toHaveLength(20);
    expect(list[list.length - 1].createdAt).toBe('2026-01-01T00:00:01.000Z');
  });

  it('U-BK-03 復元で業務データを完全に上書きし、履歴は維持する', async () => {
    await setName('元の大会');
    const b = await createBackup('手動');
    await setName('変更後');
    await updateDb((db) => {
      db.players.push({ id: 'p', tournamentId: 't1', name: 'x', birthDate: '1970-01-01', teamName: '', partyFixed: false, partyNumber: null, absent: false, order: 1 });
    });
    expect(await restoreBackup(b.id)).toBe(true);
    const db = await loadDb();
    expect(db.tournaments[0].name).toBe('元の大会');
    expect(db.players).toHaveLength(0);
    expect(await listBackups()).toHaveLength(1);
  });

  it('U-BK-04 復元後も、復元時点より後に作成されたバックアップから復元できる', async () => {
    await setName('A');
    const a = await createBackup('手動', new Date('2026-11-16T10:00:00Z'));
    await setName('B');
    const b = await createBackup('手動', new Date('2026-11-16T11:00:00Z'));
    await restoreBackup(a.id);
    expect((await loadDb()).tournaments[0].name).toBe('A');
    expect((await listBackups()).map((x) => x.id)).toEqual([b.id, a.id]);
    await restoreBackup(b.id);
    expect((await loadDb()).tournaments[0].name).toBe('B');
  });

  it('U-BK-05 作成日時の期間（日本時間の日付、両端含む）で絞り込める', async () => {
    await createBackup('手動', new Date('2026-11-15T14:59:59Z')); // JST 11/15 23:59:59
    await createBackup('手動', new Date('2026-11-15T15:00:00Z')); // JST 11/16 00:00:00
    await createBackup('手動', new Date('2026-11-16T14:59:59Z')); // JST 11/16 23:59:59
    await createBackup('手動', new Date('2026-11-16T15:00:00Z')); // JST 11/17 00:00:00
    const list = await listBackups('2026-11-16', '2026-11-16');
    expect(list.map((b) => b.createdAt)).toEqual(['2026-11-16T14:59:59.000Z', '2026-11-15T15:00:00.000Z']);
    expect(await listBackups('2026-11-17', null)).toHaveLength(1);
    expect(await listBackups(null, '2026-11-15')).toHaveLength(1);
    expect(await listBackups('2026-11-17', '2026-11-15')).toHaveLength(0);
  });

  it('U-BK-06 存在しない・不正なIDはfalseでデータ不変', async () => {
    await setName('現在');
    expect(await restoreBackup('../x')).toBe(false);
    expect(await restoreBackup('2026-01-01T00-00-00-000Z-abcdef')).toBe(false);
    expect((await loadDb()).tournaments[0].name).toBe('現在');
  });

  it('U-BK-08 バックアップは全テーブル（大会・競技情報・選手・組合せ表・スコア表・順位表）を含み、復元ですべて戻る', async () => {
    await updateDb((db) => {
      db.tournaments = [{ id: 't1', name: '定例会', date: '2026-11-16', place: 'x', status: '終了', createdAt: '2026-11-16T00:00:00Z' }];
      db.competitions = [
        {
          tournamentId: 't1',
          rounds: 1,
          holeInOneConversionEnabled: true,
          holeInOneConversionValue: -2,
          maxPartySize: 6,
          partyAssignmentMethod: 'シャッフル',
          teamBattleEnabled: false,
          teamRankingMethod: null,
        },
      ];
      db.players = [{ id: 'p', tournamentId: 't1', name: 'Aさん', birthDate: '1971-05-24', teamName: '', partyFixed: false, partyNumber: null, absent: false, order: 1 }];
      db.parties = [{ tournamentId: 't1', partyNumber: 1, startHole: 1, playerIds: ['p'] }];
      db.scores = [{ tournamentId: 't1', playerId: 'p', round: 1, holes: [1, 2, 3, 4, 5, 6, 7, 8] }];
      db.rankings = [
        { tournamentId: 't1', createdAt: '2026-11-16T01:00:00Z', individual: [], team: null, teamRankingMethod: null, excludedPlayerNames: [] },
      ];
    });
    const before = await loadDb();
    const b = await createBackup('手動');
    await updateDb((db) => {
      for (const key of Object.keys(db) as (keyof typeof db)[]) db[key] = [];
    });
    expect(await restoreBackup(b.id)).toBe(true);
    const after = await loadDb();
    expect(after).toEqual(before);
    for (const key of ['tournaments', 'competitions', 'players', 'parties', 'scores', 'rankings'] as const) {
      expect(after[key], key).toHaveLength(1);
    }
  });

  it('U-BK-07 壊れたバックアップファイルは一覧から除外し、他は表示する', async () => {
    await createBackup('手動');
    writeFileSync(path.join(dir, 'backups', 'broken.json'), '{not json');
    expect(await listBackups()).toHaveLength(1);
  });
});
