'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, ErrorDialog } from '@/components/ui/ConfirmDialog';
import { apiRequest } from '@/lib/client/apiClient';
import { formatDateTimeTokyo } from '@/lib/domain/dates';
import type { BackupMeta } from '@/lib/store/backup';

/** A8 バックアップ・リストア */
export function BackupView({ isViewer }: { isViewer: boolean }) {
  const router = useRouter();
  const [history, setHistory] = useState<BackupMeta[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (f: string, t: string) => {
    const q = new URLSearchParams();
    if (f) q.set('from', f);
    if (t) q.set('to', t);
    const res = await apiRequest<BackupMeta[]>('GET', `/api/backups?${q.toString()}`);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setHistory(res.data);
    setSelected((s) => (s && res.data.some((b) => b.id === s) ? s : null));
  }, []);

  useEffect(() => {
    load('', '');
  }, [load]);

  async function manualBackup() {
    setBusy(true);
    const res = await apiRequest('POST', '/api/backups');
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setNotice('バックアップを作成しました');
    await load(from, to);
  }

  async function restore() {
    if (!selected) return;
    setBusy(true);
    const res = await apiRequest('POST', `/api/backups/${selected}/restore`);
    setBusy(false);
    setConfirming(false);
    if (!res.ok) return setError(res.error.message);
    setNotice('復元しました');
    // 復元で全業務データが置き換わるため、クライアント側のルーターキャッシュを破棄する
    // （破棄しないと、復元後に大会一覧等へ戻った際に復元前の内容が表示されることがある）
    router.refresh();
  }

  const selectedMeta = history.find((h) => h.id === selected);

  return (
    <div className="p-6">
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-lg font-bold">バックアップ・リストア</h1>
        <div className="flex items-center gap-3">
          {notice && (
            <span role="status" className="text-sm text-green-700">
              {notice}
            </span>
          )}
          <Button onClick={manualBackup} disabled={isViewer || busy}>
            手動バックアップ
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-end gap-2 text-sm">
        <label>
          開始日
          <input aria-label="開始日" type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <span className="pb-2">〜</span>
        <label>
          終了日
          <input aria-label="終了日" type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button variant="secondary" onClick={() => load(from, to)}>
          絞込
        </Button>
      </div>

      <div className="mt-4 rounded-md border border-gray-200 bg-white">
        {history.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">バックアップ履歴はありません</p>}
        {history.map((h) => (
          <label
            key={h.id}
            data-testid="backup-row"
            className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0"
          >
            <input type="radio" name="backup" checked={selected === h.id} onChange={() => setSelected(h.id)} />
            {formatDateTimeTokyo(h.createdAt)} <span className="text-gray-500">{h.trigger}</span>
          </label>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={() => setConfirming(true)} disabled={isViewer || !selected}>
          復元
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="復元の最終確認"
        message={`現在のすべてのデータが、選択したバックアップ（${
          selectedMeta ? formatDateTimeTokyo(selectedMeta.createdAt) : ''
        }）の内容で完全に上書きされます。元に戻せません。復元しますか？`}
        confirmLabel="復元する"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={restore}
      />
      <ErrorDialog message={error} onClose={() => setError(null)} />
    </div>
  );
}
