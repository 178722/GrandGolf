import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { getSessionRole, handle, ok, readJson } from '@/lib/api';
import { ROLE_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { createBackup } from '@/lib/store/backup';

// ログアウト。「バックアップを作成しますか？」で「バックアップする」を選んだ場合（backup: true）、
// 管理者ロールのみバックアップ（契機：ログアウト）を作成してからセッションを破棄する。
export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson(request);
    const role = await getSessionRole();
    let backupCreated = false;
    if (body.backup === true && role === 'admin') {
      await createBackup('ログアウト');
      backupCreated = true;
    }
    const cookieStore = cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
    cookieStore.delete(ROLE_COOKIE_NAME);
    return ok({ ok: true, backupCreated });
  });
}
