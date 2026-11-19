'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, ErrorDialog } from '@/components/ui/ConfirmDialog';
import { apiRequest } from '@/lib/client/apiClient';
import { formatSlashDate } from '@/lib/domain/dates';
import { MESSAGES } from '@/lib/service/errors';
import type { Tournament } from '@/types/tournament';

const TABS = [
  { key: 'info', label: '大会情報', href: (id: string) => `/tournaments/${id}` },
  { key: 'competition', label: '競技情報', href: (id: string) => `/tournaments/${id}/competition` },
  { key: 'players', label: '選手情報', href: (id: string) => `/tournaments/${id}/players` },
] as const;

/** A3・A4・A5 共通の大会名ヘッダー・操作ボタン・共通タブ */
export function TournamentHeader({
  tournament,
  hasPairings,
  isViewer,
}: {
  tournament: Tournament;
  hasPairings: boolean;
  isViewer: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [dialog, setDialog] = useState<'create-pairings' | 'end' | 'restart' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isInProgress = tournament.status === '進行中';
  // 書き換え系の操作ができない理由（閲覧モード・大会終了）。null なら操作可能
  const readOnlyReason = isViewer ? MESSAGES.viewer : isInProgress ? null : MESSAGES.finished;
  const canEdit = readOnlyReason === null;
  const pairingsUrl = `/tournaments/${tournament.id}/pairings`;

  async function run(fn: () => ReturnType<typeof apiRequest>, successNotice?: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    setDialog(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    if (successNotice) setNotice(successNotice);
    router.refresh();
  }

  return (
    <div className="border-b border-gray-200 bg-white px-6 py-4">
      <Link href="/tournaments" className="text-sm text-gray-500 hover:underline">
        ← 大会一覧
      </Link>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-xl font-bold">{tournament.name}</h1>
        <Badge tone={isInProgress ? 'success' : 'muted'}>{tournament.status}</Badge>
      </div>
      <p className="text-sm text-gray-500">
        {formatSlashDate(tournament.date)}・{tournament.place}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* 閲覧モード・大会終了中も書き換え系のボタンは非表示にせず、disabled で表示する（要件定義書2.1・2.3） */}
        <Button
          variant="secondary"
          disabled={!canEdit}
          title={readOnlyReason ?? undefined}
          onClick={() => setDialog('create-pairings')}
        >
          組合せ表を作成する
        </Button>
        <Button
          variant="secondary"
          disabled={!canEdit || !hasPairings}
          title={readOnlyReason ?? (hasPairings ? undefined : '組合せ表が作成されていません')}
          onClick={() => router.push(pairingsUrl)}
        >
          大会を開催する
        </Button>
        {!canEdit && (
          <Button variant="secondary" onClick={() => router.push(pairingsUrl)}>
            大会を閲覧する
          </Button>
        )}
        {isInProgress ? (
          <Button
            variant="danger"
            disabled={isViewer}
            title={isViewer ? MESSAGES.viewer : undefined}
            onClick={() => setDialog('end')}
          >
            大会を終了する
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={isViewer}
            title={isViewer ? MESSAGES.viewer : undefined}
            onClick={() => setDialog('restart')}
          >
            大会を再開する
          </Button>
        )}
        {notice && <span className="text-sm text-green-700">{notice}</span>}
      </div>

      <div className="mt-4 flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => {
          const href = tab.href(tournament.id);
          const active = pathname === href;
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

      <ConfirmDialog
        open={dialog === 'create-pairings'}
        title="組合せ表を作成しますか？"
        message={
          hasPairings ? (
            <p className="text-red-600">
              組合せ表は作成済みです。再作成すると現在のパーティ編成・開始ホール・スコア表は上書きされます。
            </p>
          ) : (
            <p>登録済みの全選手を対象に、パーティ編成と開始ホールを自動で作成します。</p>
          )
        }
        confirmLabel="作成する"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          run(() => apiRequest('POST', `/api/tournaments/${tournament.id}/pairings`), '組合せ表を作成しました')
        }
      />

      <ConfirmDialog
        open={dialog === 'end'}
        title="大会を終了しますか？"
        message="大会を終了すると、大会情報・競技情報・選手情報の編集、スコアの入力・修正、順位表の作成、順位の手動確定（じゃんけん結果の確定）ができなくなります。終了しますか？"
        confirmLabel="終了する"
        cancelLabel="しない"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => apiRequest('PUT', `/api/tournaments/${tournament.id}/status`, { status: '終了' }))}
      />

      <ConfirmDialog
        open={dialog === 'restart'}
        title="大会を再開しますか？"
        confirmLabel="再開する"
        cancelLabel="しない"
        busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => apiRequest('PUT', `/api/tournaments/${tournament.id}/status`, { status: '進行中' }))}
      />

      <ErrorDialog message={error} onClose={() => setError(null)} />
    </div>
  );
}
