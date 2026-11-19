import { redirect } from 'next/navigation';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { TournamentForm } from '@/components/tournament/TournamentForm';
import { getSessionRole } from '@/lib/api';
import { todayInTokyo } from '@/lib/domain/dates';

export const dynamic = 'force-dynamic';

export default async function NewTournamentPage() {
  // 閲覧モードでは新規作成できない
  if ((await getSessionRole()) !== 'admin') redirect('/tournaments');
  return (
    <main>
      <AdminHeader />
      <TournamentForm defaultDate={todayInTokyo()} />
    </main>
  );
}
