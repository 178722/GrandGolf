import { NextRequest } from 'next/server';
import { handle, ok, readJson, requireAdmin } from '@/lib/api';
import { confirmManualRank } from '@/lib/service/tournamentService';

// じゃんけん待ちの最終順位を手動確定する
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson(request);
    return ok(await confirmManualRank(params.id, body.target, body.rank));
  });
}
