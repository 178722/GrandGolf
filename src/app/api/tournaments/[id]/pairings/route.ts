import { NextRequest } from 'next/server';
import { handle, ok, requireAdmin } from '@/lib/api';
import { generateTournamentPairings } from '@/lib/service/tournamentService';

// 組合せ表（パーティ編成・開始ホール）とスコア表の一括生成・再生成
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireAdmin();
    return ok(await generateTournamentPairings(params.id), 201);
  });
}
