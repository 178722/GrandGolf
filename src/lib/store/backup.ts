// バックアップ・リストア（要件定義書4章「バックアップ」）
// バックアップは <データ保存先>/backups/<id>.json に保存し、サーバー側にのみ保持する（ダウンロード機能は提供しない）。

import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import type { Db } from '@/types/tournament';
import { tokyoDateRangeToUtc } from '@/lib/domain/dates';
import { getDataDir, loadDb, normalizeDb, saveDb, withDbLock } from './db';

export type BackupTrigger = '手動' | 'ログアウト';

export type BackupMeta = { id: string; createdAt: string; trigger: BackupTrigger };

type BackupFile = BackupMeta & { data: Db };

export const MAX_BACKUPS = 20;

function getBackupDir(): string {
  return path.join(getDataDir(), 'backups');
}

const ID_PATTERN = /^[0-9A-Za-z-]+$/;

async function readAllMeta(): Promise<BackupMeta[]> {
  let files: string[];
  try {
    files = await readdir(getBackupDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const metas: BackupMeta[] = [];
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    try {
      const raw = JSON.parse(await readFile(path.join(getBackupDir(), f), 'utf-8')) as BackupFile;
      metas.push({ id: raw.id, createdAt: raw.createdAt, trigger: raw.trigger });
    } catch {
      // 壊れたファイルは一覧から除外する
    }
  }
  // 作成日時の新しい順
  return metas.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** 現在の業務データでバックアップを作成し、保持数（20件）を超えた分を古い順に削除する */
export async function createBackup(trigger: BackupTrigger, now: Date = new Date()): Promise<BackupMeta> {
  return withDbLock(async () => {
    const data = await loadDb();
    await mkdir(getBackupDir(), { recursive: true });
    const createdAt = now.toISOString();
    const id = `${createdAt.replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
    const file: BackupFile = { id, createdAt, trigger, data };
    await writeFile(path.join(getBackupDir(), `${id}.json`), JSON.stringify(file), 'utf-8');

    const all = await readAllMeta();
    for (const old of all.slice(MAX_BACKUPS)) {
      await unlink(path.join(getBackupDir(), `${old.id}.json`)).catch(() => undefined);
    }
    return { id, createdAt, trigger };
  });
}

/** バックアップ履歴（新しい順）。from/to は Asia/Tokyo の日付（YYYY-MM-DD、両端を含む） */
export async function listBackups(from: string | null = null, to: string | null = null): Promise<BackupMeta[]> {
  const { fromMs, toMs } = tokyoDateRangeToUtc(from, to);
  return (await readAllMeta()).filter((m) => {
    const t = new Date(m.createdAt).getTime();
    return t >= fromMs && t < toMs;
  });
}

/** 選択したバックアップの内容で業務データを完全に上書きする（バックアップ履歴自体は対象外） */
export async function restoreBackup(id: string): Promise<boolean> {
  if (!ID_PATTERN.test(id)) return false;
  return withDbLock(async () => {
    let file: BackupFile;
    try {
      file = JSON.parse(await readFile(path.join(getBackupDir(), `${id}.json`), 'utf-8')) as BackupFile;
    } catch {
      return false;
    }
    await saveDb(normalizeDb(file.data));
    return true;
  });
}
