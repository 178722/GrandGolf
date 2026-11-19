import { AdminHeader } from '@/components/admin/AdminHeader';
import { TournamentHeader } from '@/components/admin/TournamentHeader';
import { PlayersEditor } from '@/components/tournament/PlayersEditor';
import { loadTournamentPage } from '@/lib/pageContext';
import { MESSAGES } from '@/lib/service/errors';

export const dynamic = 'force-dynamic';

export default async function PlayersPage({ params }: { params: { id: string } }) {
  const { detail, isViewer } = await loadTournamentPage(params.id);
  const { tournament } = detail;
  const readOnlyReason = isViewer ? MESSAGES.viewer : tournament.status === '終了' ? MESSAGES.finished : null;

  return (
    <main>
      <AdminHeader />
      <TournamentHeader tournament={tournament} hasPairings={detail.hasPairings} isViewer={isViewer} />
      <PlayersEditor
        tournamentId={tournament.id}
        players={detail.players}
        competition={detail.competition}
        playerIdsWithResults={[...new Set(detail.scores.map((s) => s.playerId))]}
        hasResults={detail.hasResults}
        readOnlyReason={readOnlyReason}
      />
    </main>
  );
}
