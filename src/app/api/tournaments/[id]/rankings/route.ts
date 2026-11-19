import { NextRequest } from 'next/server';
import { handle, ok, requireAdmin } from '@/lib/api';
import { generateRanking } from '@/lib/service/tournamentService';

// 順位表作成（その時点のスコアで再集計する）
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireAdmin();
    return ok(await generateRanking(params.id), 201);
  });
}
