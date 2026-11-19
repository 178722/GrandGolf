import { AdminHeader } from '@/components/admin/AdminHeader';
import { TournamentHeader } from '@/components/admin/TournamentHeader';
import { CompetitionForm } from '@/components/tournament/CompetitionForm';
import { loadTournamentPage } from '@/lib/pageContext';
import { MESSAGES } from '@/lib/service/errors';

export const dynamic = 'force-dynamic';

export default async function CompetitionPage({ params }: { params: { id: string } }) {
  const { detail, isViewer } = await loadTournamentPage(params.id);
  const { tournament } = detail;
  const readOnlyReason = isViewer
    ? MESSAGES.viewer
    : tournament.status === '終了'
      ? MESSAGES.finished
      : detail.hasResults
        ? MESSAGES.resultsExistCompetition
        : null;

  return (
    <main>
      <AdminHeader />
      <TournamentHeader tournament={tournament} hasPairings={detail.hasPairings} isViewer={isViewer} />
      <CompetitionForm
        tournamentId={tournament.id}
        competition={detail.competition}
        hasPairings={detail.hasPairings}
        readOnlyReason={readOnlyReason}
      />
    </main>
  );
}
