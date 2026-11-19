import { NextRequest } from 'next/server';
import { handle, ok, readJson, requireAdmin, requireSession } from '@/lib/api';
import { AppError } from '@/lib/service/errors';
import { deleteTournament, getTournamentDetail, updateTournament } from '@/lib/service/tournamentService';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

// 大会の詳細（競技情報・選手・組合せ表・スコア・順位表を含む）
export async function GET(_request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    await requireSession();
    const detail = await getTournamentDetail(params.id);
    if (!detail) throw new AppError('NOT_FOUND', '大会が見つかりません');
    return ok(detail);
  });
}

// 大会情報の更新
export async function PUT(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    await requireAdmin();
    return ok(await updateTournament(params.id, await readJson(request)));
  });
}

// 大会の削除（カスケード削除）
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    await requireAdmin();
    await deleteTournament(params.id);
    return ok({ ok: true });
  });
}
