'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ErrorDialog } from '@/components/ui/ConfirmDialog';
import { apiRequest } from '@/lib/client/apiClient';
import { calcAge, formatAge } from '@/lib/domain/age';
import { formatDateTimeTokyo } from '@/lib/domain/dates';
import type { RankingSnapshot } from '@/types/tournament';

type Target =
  | { kind: 'individual'; playerId: string; label: string; min: number; max: number }
  | { kind: 'team'; teamName: string; label: string; min: number; max: number };

/**
 * A7 順位表。「順位表作成」実行時点のスコアで集計した結果を表示し、じゃんけん待ちの最終順位を手動確定する。
 * 個人戦：1.総合スコアが小さい 2.年齢が上 3.じゃんけん
 * チーム戦：1.チームの合計（または平均）スコアが小さい 2.チームの合計年齢が上 3.じゃんけん
 * 個人戦の年齢は、大会の開催日時点の「◯歳◯日」で表示する（生年月日は表示しない）。
 */
export function RankingsView({
  tournamentId,
  tournamentDate,
  ranking,
  readOnlyReason,
}: {
  tournamentId: string;
  /** 大会の開催日（年齢の基準日） */
  tournamentDate: string;
  ranking: RankingSnapshot | null;
  /** 順位表作成・手動確定ができない理由（閲覧モード・大会終了）。null なら操作可能 */
  readOnlyReason: string | null;
}) {
  const readOnly = !!readOnlyReason;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [rankDraft, setRankDraft] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    const res = await apiRequest('POST', `/api/tournaments/${tournamentId}/rankings`);
    setBusy(false);
    if (!res.ok) setError(res.error.message);
    else router.refresh();
  }

  function openConfirm(t: Target) {
    setTarget(t);
    setRankDraft(String(t.min));
    setDialogError(null);
  }

  async function confirmRank() {
    if (!target) return;
    const rank = Number(rankDraft);
    setBusy(true);
    const res = await apiRequest('PUT', `/api/tournaments/${tournamentId}/rankings/manual`, {
      target: target.kind === 'individual' ? { kind: 'individual', playerId: target.playerId } : { kind: 'team', teamName: target.teamName },
      rank,
    });
    setBusy(false);
    if (!res.ok) {
      setDialogError(res.error.message);
      return;
    }
    setTarget(null);
    router.refresh();
  }

  const teamLabel = ranking?.teamRankingMethod === '平均' ? '平均スコア' : '合計スコア';

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {ranking ? `作成日時：${formatDateTimeTokyo(ranking.createdAt)}` : ''}
        </p>
        <Button onClick={generate} disabled={readOnly || busy} title={readOnlyReason ?? undefined}>
          順位表作成
        </Button>
      </div>
      {readOnlyReason && <p className="mb-3 text-sm text-red-600">{readOnlyReason}</p>}

      {!ranking ? (
        <p className="text-sm text-gray-500">「順位表作成」ボタンを押すと、その時点のスコアを集計して表示します。</p>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-base font-semibold">個人戦 総合順位表</h2>
            <p className="mb-2 text-xs text-gray-500">順位の決定方法：1. トータルスコアが小さい　2. 年齢が上　3. じゃんけん</p>
            <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
              <table className="w-full text-sm" data-testid="individual-ranking">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">順位</th>
                    <th className="px-4 py-2 font-medium">選手名</th>
                    <th className="px-4 py-2 font-medium">チーム名</th>
                    <th className="px-4 py-2 font-medium">総合スコア</th>
                    <th className="px-4 py-2 font-medium">年齢</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {ranking.individual.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                        集計対象の選手がいません
                      </td>
                    </tr>
                  )}
                  {ranking.individual.map((r) => (
                    <tr key={r.playerId} className="border-t border-gray-100" data-testid="individual-row">
                      <td className="px-4 py-3">{r.rank}</td>
                      <td className="px-4 py-3">{r.playerName}</td>
                      <td className="px-4 py-3">{r.teamName || '-'}</td>
                      <td className="px-4 py-3">{r.totalScore}</td>
                      <td className="px-4 py-3">{formatAge(calcAge(r.birthDate, tournamentDate))}</td>
                      <td className="px-4 py-3 text-right">
                        {r.jankenPending && (
                          <div className="flex justify-end gap-2">
                            <Badge tone="warning">じゃんけん待ち</Badge>
                            <Button
                              variant="secondary"
                              disabled={readOnly}
                              title={readOnlyReason ?? undefined}
                              onClick={() =>
                                openConfirm({
                                  kind: 'individual',
                                  playerId: r.playerId,
                                  label: r.playerName,
                                  min: r.tieRank,
                                  max: r.tieRank + r.tieSize - 1,
                                })
                              }
                            >
                              手動確定
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {ranking.team && (
            <section>
              <h2 className="mb-2 text-base font-semibold">チーム戦 総合順位表（{ranking.teamRankingMethod}）</h2>
              <p className="mb-2 text-xs text-gray-500">
                順位の決定方法：1. チームの{ranking.teamRankingMethod}スコアが小さい　2. チームの合計年齢が上　3. じゃんけん
              </p>
              <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                <table className="w-full text-sm" data-testid="team-ranking">
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">順位</th>
                      <th className="px-4 py-2 font-medium">チーム名</th>
                      <th className="px-4 py-2 font-medium">人数</th>
                      <th className="px-4 py-2 font-medium">{teamLabel}</th>
                      <th className="px-4 py-2 font-medium">合計年齢</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.team.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                          集計対象のチームがありません
                        </td>
                      </tr>
                    )}
                    {ranking.team.map((r) => (
                      <tr key={r.teamName} className="border-t border-gray-100" data-testid="team-row">
                        <td className="px-4 py-3">{r.rank}</td>
                        <td className="px-4 py-3">{r.teamName}</td>
                        <td className="px-4 py-3">{r.memberCount}</td>
                        <td className="px-4 py-3">
                          {ranking.teamRankingMethod === '平均'
                            ? (Math.round(r.averageScore * 100) / 100).toString()
                            : r.totalScore}
                        </td>
                        <td className="px-4 py-3">
                          {r.totalAgeYears}歳{r.totalAgeDays}日
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.jankenPending && (
                            <div className="flex justify-end gap-2">
                              <Badge tone="warning">じゃんけん待ち</Badge>
                              <Button
                                variant="secondary"
                                disabled={readOnly}
                                title={readOnlyReason ?? undefined}
                                onClick={() =>
                                  openConfirm({
                                    kind: 'team',
                                    teamName: r.teamName,
                                    label: r.teamName,
                                    min: r.tieRank,
                                    max: r.tieRank + r.tieSize - 1,
                                  })
                                }
                              >
                                手動確定
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs text-gray-500">※合計年齢は各選手の「◯歳◯日」の歳・日をそれぞれ合計した表示です（比較は生年月日からの日数の合計で行います）。</p>
            </section>
          )}

          {ranking.excludedPlayerNames.length > 0 && (
            <p className="text-sm text-amber-700" data-testid="excluded">
              全ラウンド分のスコアが保存されていないため集計対象外：{ranking.excludedPlayerNames.join('、')}
            </p>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">※全ラウンド分のスコアが保存済みでない選手は、集計対象から除外されます。</p>

      <Dialog open={target !== null} onClose={() => setTarget(null)} title={`${target?.label ?? ''} の最終順位を手動確定`}>
        <div className="space-y-3 text-sm">
          <label className="block">
            確定する順位（{target?.min}〜{target?.max}）
            <input
              aria-label="確定する順位"
              type="number"
              min={target?.min}
              max={target?.max}
              className="input mt-1"
              value={rankDraft}
              onChange={(e) => setRankDraft(e.target.value)}
            />
          </label>
          {dialogError && <p className="text-red-600">{dialogError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setTarget(null)}>
              キャンセル
            </Button>
            <Button onClick={confirmRank} disabled={busy}>
              確定する
            </Button>
          </div>
        </div>
      </Dialog>
      <ErrorDialog message={error} onClose={() => setError(null)} />
    </div>
  );
}
