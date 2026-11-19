import { NextRequest } from 'next/server';
import { handle, ok, readJson, requireAdmin } from '@/lib/api';
import { setTournamentStatus } from '@/lib/service/tournamentService';

// 大会ステータスの切り替え（大会を終了する／大会を再開する）
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson(request);
    return ok(await setTournamentStatus(params.id, body.status));
  });
}
