import { AdminHeader } from '@/components/admin/AdminHeader';
import { TournamentList } from '@/components/tournament/TournamentList';
import { getSessionRole } from '@/lib/api';
import { listTournaments } from '@/lib/service/tournamentService';

export const dynamic = 'force-dynamic';

export default async function TournamentListPage() {
  const [tournaments, role] = await Promise.all([listTournaments(), getSessionRole()]);
  return (
    <main>
      <AdminHeader />
      <TournamentList tournaments={tournaments} isViewer={role !== 'admin'} />
    </main>
  );
}
