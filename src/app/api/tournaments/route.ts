import { NextRequest } from 'next/server';
import { handle, ok, readJson, requireAdmin, requireSession } from '@/lib/api';
import { createTournament, listTournaments } from '@/lib/service/tournamentService';

export const dynamic = 'force-dynamic';

// 大会一覧
export async function GET() {
  return handle(async () => {
    await requireSession();
    return ok(await listTournaments());
  });
}

// 大会の新規登録
export async function POST(request: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    return ok(await createTournament(await readJson(request)), 201);
  });
}
