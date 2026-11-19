// サーバーコンポーネント（画面）用のデータ取得ヘルパー

import { notFound } from 'next/navigation';
import { getSessionRole } from '@/lib/api';
import { getTournamentDetail, type TournamentDetail } from '@/lib/service/tournamentService';

export type PageContext = { detail: TournamentDetail; isViewer: boolean };

export async function loadTournamentPage(id: string): Promise<PageContext> {
  const detail = await getTournamentDetail(id);
  if (!detail) notFound();
  const role = await getSessionRole();
  return { detail, isViewer: role !== 'admin' };
}
