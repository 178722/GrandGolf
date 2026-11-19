import { AdminHeader } from '@/components/admin/AdminHeader';
import { OperationsHeader } from '@/components/admin/OperationsHeader';
import { PairingsTable } from '@/components/tournament/PairingsTable';
import { loadTournamentPage } from '@/lib/pageContext';
import { MESSAGES } from '@/lib/service/errors';

export const dynamic = 'force-dynamic';

export default async function PairingsPage({ params }: { params: { id: string } }) {
  const { detail, isViewer } = await loadTournamentPage(params.id);
  const { tournament } = detail;
  const readOnlyReason = isViewer ? MESSAGES.viewer : tournament.status === '終了' ? MESSAGES.finished : null;

  return (
    <main>
      <AdminHeader />
      <OperationsHeader tournament={tournament} />
      <PairingsTable
        tournament={tournament}
        competition={detail.competition}
        players={detail.players}
        parties={detail.parties}
        scores={detail.scores}
        readOnlyReason={readOnlyReason}
      />
    </main>
  );
}
