import { AdminHeader } from '@/components/admin/AdminHeader';
import { TournamentHeader } from '@/components/admin/TournamentHeader';
import { TournamentForm } from '@/components/tournament/TournamentForm';
import { loadTournamentPage } from '@/lib/pageContext';
import { MESSAGES } from '@/lib/service/errors';

export const dynamic = 'force-dynamic';

export default async function TournamentInfoPage({ params }: { params: { id: string } }) {
  const { detail, isViewer } = await loadTournamentPage(params.id);
  const { tournament } = detail;
  const readOnlyReason = isViewer ? MESSAGES.viewer : tournament.status === '終了' ? MESSAGES.finished : null;

  return (
    <main>
      <AdminHeader />
      <TournamentHeader tournament={tournament} hasPairings={detail.hasPairings} isViewer={isViewer} />
      <TournamentForm tournament={tournament} readOnlyReason={readOnlyReason} />
    </main>
  );
}
