import { NextRequest } from 'next/server';
import { handle, ok, parsePartyNumber, readJson, requireAdmin } from '@/lib/api';
import { updateStartHole } from '@/lib/service/tournamentService';

// 開始ホールの手動変更（パーティ単位）
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; partyNumber: string } },
) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson(request);
    return ok(await updateStartHole(params.id, parsePartyNumber(params.partyNumber), body.startHole));
  });
}
