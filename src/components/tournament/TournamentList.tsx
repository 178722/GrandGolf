'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, ErrorDialog } from '@/components/ui/ConfirmDialog';
import { apiRequest } from '@/lib/client/apiClient';
import { formatSlashDate } from '@/lib/domain/dates';
import type { Tournament } from '@/types/tournament';

/** A2 大会一覧。行をクリックすると大会情報画面（A3）へ遷移する */
export function TournamentList({ tournaments, isViewer }: { tournaments: Tournament[]; isViewer: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<Tournament | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    const res = await apiRequest('DELETE', `/api/tournaments/${deleting.id}`);
    setBusy(false);
    setDeleting(null);
    if (!res.ok) setError(res.error.message);
    else router.refresh();
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">大会一覧</h1>
        {isViewer ? (
          <Button disabled title="閲覧モードのため変更できません">
            + 新規作成
          </Button>
        ) : (
          <Link href="/tournaments/new">
            <Button>+ 新規作成</Button>
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">大会名</th>
              <th className="px-4 py-2 font-medium">開催日</th>
              <th className="px-4 py-2 font-medium">開催場所</th>
              <th className="px-4 py-2 font-medium">ステータス</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {tournaments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  登録されている大会はありません。「+ 新規作成」から登録してください。
                </td>
              </tr>
            )}
            {tournaments.map((t) => (
              <tr
                key={t.id}
                data-testid="tournament-row"
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/tournaments/${t.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') router.push(`/tournaments/${t.id}`);
                }}
                className="cursor-pointer border-t border-gray-100 hover:bg-green-50"
              >
                <td className="px-4 py-3 font-medium text-green-800">{t.name}</td>
                <td className="px-4 py-3">{formatSlashDate(t.date)}</td>
                <td className="px-4 py-3">{t.place}</td>
                <td className="px-4 py-3">
                  <Badge tone={t.status === '進行中' ? 'success' : 'muted'}>{t.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="danger"
                    disabled={isViewer}
                    title={isViewer ? '閲覧モードのため変更できません' : undefined}
                    onClick={(e) => {
                      // 行選択（画面遷移）を発生させない
                      e.stopPropagation();
                      setDeleting(t);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    削除
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="大会を削除しますか？"
        message={`この大会（${deleting?.name ?? ''}）を削除すると、紐づく競技情報・選手情報・組合せ表・スコア表・順位表がすべて削除されます。元に戻せません。削除しますか？`}
        confirmLabel="削除する"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
      <ErrorDialog message={error} onClose={() => setError(null)} />
    </div>
  );
}
