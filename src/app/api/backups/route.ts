import { NextRequest } from 'next/server';
import { handle, ok, requireAdmin, requireSession } from '@/lib/api';
import { isValidIsoDate } from '@/lib/domain/dates';
import { AppError } from '@/lib/service/errors';
import { createBackup, listBackups } from '@/lib/store/backup';

export const dynamic = 'force-dynamic';

// バックアップ履歴（?from=YYYY-MM-DD&to=YYYY-MM-DD で作成日時の期間を絞り込み）
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireSession();
    const from = request.nextUrl.searchParams.get('from') || null;
    const to = request.nextUrl.searchParams.get('to') || null;
    if ((from && !isValidIsoDate(from)) || (to && !isValidIsoDate(to)))
      throw new AppError('VALIDATION_ERROR', '期間の指定が正しくありません');
    return ok(await listBackups(from, to));
  });
}

// 手動バックアップ
export async function POST() {
  return handle(async () => {
    await requireAdmin();
    return ok(await createBackup('手動'), 201);
  });
}
