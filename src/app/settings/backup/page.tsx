import Link from 'next/link';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { BackupView } from '@/components/backup/BackupView';
import { getSessionRole } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function BackupPage() {
  const role = await getSessionRole();
  return (
    <main>
      <AdminHeader />
      <div className="px-6 pt-6">
        <Link href="/tournaments" className="text-sm text-gray-500 hover:underline">
          ← 大会一覧
        </Link>
      </div>
      <BackupView isViewer={role !== 'admin'} />
    </main>
  );
}
