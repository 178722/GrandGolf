import { AdminHeader } from '@/components/admin/AdminHeader';
import { OperationsHeader } from '@/components/admin/OperationsHeader';
import { RankingsView } from '@/components/tournament/RankingsView';
import { loadTournamentPage } from '@/lib/pageContext';
import { MESSAGES } from '@/lib/service/errors';

export const dynamic = 'force-dynamic';

export default async function RankingsPage({ params }: { params: { id: string } }) {
  const { detail, isViewer } = await loadTournamentPage(params.id);
  // 閲覧モード・大会終了中は順位表作成・手動確定を行えない（ボタンは disabled で表示する）
  const readOnlyReason = isViewer
    ? MESSAGES.viewer
    : detail.tournament.status === '終了'
      ? MESSAGES.finished
      : null;
  return (
    <main>
      <AdminHeader />
      <OperationsHeader tournament={detail.tournament} />
      <RankingsView
        tournamentId={detail.tournament.id}
        tournamentDate={detail.tournament.date}
        ranking={detail.ranking}
        readOnlyReason={readOnlyReason}
      />
    </main>
  );
}
