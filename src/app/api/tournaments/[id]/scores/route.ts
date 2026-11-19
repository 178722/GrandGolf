import { NextRequest } from 'next/server';
import { handle, ok, readJson, requireAdmin } from '@/lib/api';
import { AppError } from '@/lib/service/errors';
import { deleteRoundScores, saveRoundScores } from '@/lib/service/tournamentService';

function partyNumberOf(body: Record<string, unknown>): number {
  if (typeof body.partyNumber !== 'number') throw new AppError('VALIDATION_ERROR', 'パーティ番号を指定してください');
  return body.partyNumber;
}

// パーティの1ラウンド分（8ホール）のスコアを一括保存
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson(request);
    return ok(await saveRoundScores(params.id, partyNumberOf(body), body.round, body.scores));
  });
}

// パーティの1ラウンド分のスコアを削除（未入力に戻す）
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson(request);
    await deleteRoundScores(params.id, partyNumberOf(body), body.round);
    return ok({ ok: true });
  });
}
