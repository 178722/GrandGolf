import { NextRequest } from 'next/server';
import { handle, ok, requireAdmin } from '@/lib/api';
import { AppError } from '@/lib/service/errors';
import { restoreBackup } from '@/lib/store/backup';

// 選択したバックアップで業務データを完全に上書きする
export async function POST(_request: NextRequest, { params }: { params: { backupId: string } }) {
  return handle(async () => {
    await requireAdmin();
    if (!(await restoreBackup(params.backupId))) throw new AppError('NOT_FOUND', 'バックアップが見つかりません');
    return ok({ ok: true });
  });
}
