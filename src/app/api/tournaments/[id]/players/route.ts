import { NextRequest } from 'next/server';
import { handle, ok, readJson, requireAdmin } from '@/lib/api';
import { savePlayers } from '@/lib/service/tournamentService';

// 選手一覧の一括保存（新規登録・編集・削除をまとめて反映）
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson(request);
    return ok(await savePlayers(params.id, body.players, body.confirmReset === true));
  });
}
