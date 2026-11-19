import { NextRequest } from 'next/server';
import { handle, ok, readJson, requireAdmin } from '@/lib/api';
import { saveCompetition } from '@/lib/service/tournamentService';

// 競技情報の登録・更新。組合せ表生成済み（試合結果未入力）の場合は confirmReset: true が必要
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson(request);
    return ok(await saveCompetition(params.id, body.competition, body.confirmReset === true));
  });
}
