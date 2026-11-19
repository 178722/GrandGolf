'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { formatSlashDate } from '@/lib/domain/dates';
import type { Tournament } from '@/types/tournament';

const TABS = [
  { key: 'pairings', label: '組合せ・スコア表', href: (id: string) => `/tournaments/${id}/pairings` },
  { key: 'rankings', label: '順位表', href: (id: string) => `/tournaments/${id}/rankings` },
] as const;

/** A6・A7 共通の大会名ヘッダー・大会運営タブ */
export function OperationsHeader({ tournament }: { tournament: Tournament }) {
  const pathname = usePathname();

  return (
    <div className="border-b border-gray-200 bg-white px-6 py-4">
      <div className="flex gap-4 text-sm">
        <Link href="/tournaments" className="text-gray-500 hover:underline">
          ← 大会一覧
        </Link>
        <Link href={`/tournaments/${tournament.id}`} className="text-gray-500 hover:underline">
          ← 大会情報
        </Link>
      </div>
      {/* 大会情報画面（TournamentHeader）と同じく、大会名・状態の行と開催日・開催場所の行に分けて表示する */}
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-xl font-bold">{tournament.name}</h1>
        <Badge tone={tournament.status === '進行中' ? 'success' : 'muted'}>{tournament.status}</Badge>
      </div>
      <p className="text-sm text-gray-500">
        {formatSlashDate(tournament.date)}・{tournament.place}
      </p>

      <div className="mt-4 flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => {
          const href = tab.href(tournament.id);
          const active = pathname.startsWith(`/tournaments/${tournament.id}/${tab.key}`);
          return (
            <Link
              key={tab.key}
              href={href}
              className={`rounded-t-md px-4 py-2 text-sm font-medium ${
                active
                  ? 'border border-b-0 border-gray-200 bg-white text-green-800'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
