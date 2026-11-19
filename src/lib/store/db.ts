// ファイルベースJSONストア。業務データ全体を <データ保存先>/db.json に保存する。
// Node runtime（API Routes・サーバーコンポーネント）からのみ使用すること。

import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import type { Db, Player } from '@/types/tournament';

export function getDataDir(): string {
  return process.env.GRANDGOLF_DATA_DIR ?? './data';
}

function getDbPath(): string {
  return path.join(getDataDir(), 'db.json');
}

export function emptyDb(): Db {
  return { tournaments: [], competitions: [], players: [], parties: [], scores: [], rankings: [] };
}

/** 欠けているコレクションを補い、Db の形に正規化する */
export function normalizeDb(raw: unknown): Db {
  const r = (raw ?? {}) as Partial<Db>;
  const base = emptyDb();
  return {
    tournaments: Array.isArray(r.tournaments) ? r.tournaments : base.tournaments,
    competitions: Array.isArray(r.competitions) ? r.competitions : base.competitions,
    // absent（不参加）は後から追加した項目のため、未設定の既存データは参加（false）として扱う
    players: Array.isArray(r.players)
      ? (r.players as Player[]).map((p) => ({ ...p, absent: p.absent === true }))
      : base.players,
    parties: Array.isArray(r.parties) ? r.parties : base.parties,
    scores: Array.isArray(r.scores) ? r.scores : base.scores,
    rankings: Array.isArray(r.rankings) ? r.rankings : base.rankings,
  };
}

export async function loadDb(): Promise<Db> {
  try {
    const raw = await readFile(getDbPath(), 'utf-8');
    return normalizeDb(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyDb();
    throw err;
  }
}

export async function saveDb(db: Db): Promise<void> {
  await mkdir(getDataDir(), { recursive: true });
  const target = getDbPath();
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2), 'utf-8');
  await rename(tmp, target);
}

// 書き込みの直列化。Next.jsの開発サーバーではルートごとにモジュールが別インスタンスになり得るため、globalThis に保持する。
const globalForLock = globalThis as unknown as { __ggDbLock?: Promise<unknown> };

/** 排他区間内で任意の処理を行う（バックアップの作成・復元など） */
export async function withDbLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalForLock.__ggDbLock ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((r) => (release = r));
  globalForLock.__ggDbLock = prev.then(() => current);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

/** 読み込み→変更→保存を排他的に実行する。fn が例外を投げた場合は保存しない */
export async function updateDb<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  return withDbLock(async () => {
    const db = await loadDb();
    const result = await fn(db);
    await saveDb(db);
    return result;
  });
}
