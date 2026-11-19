'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { nextSort, SortHeader, type SortState } from '@/components/ui/SortHeader';
import { apiRequest } from '@/lib/client/apiClient';
import { calcAge, formatAge } from '@/lib/domain/age';
import { formatSlashDate } from '@/lib/domain/dates';
import { assignStartGroups, HOLE_COUNT, unavailableStartHoles } from '@/lib/domain/pairing';
import { holeScore, overallTotal, roundTotal } from '@/lib/domain/score';
import type { Competition, Party, Player, Score, Tournament } from '@/types/tournament';

const HOLES = Array.from({ length: HOLE_COUNT }, (_, i) => i + 1);

type PartySortKey = 'partyNumber' | 'startGroup' | 'startHole';

/**
 * パーティの表示順（既定はパーティ番号の昇順）。
 * 開始ホールが同じ場合はパーティ番号の昇順、開始グループが同じ場合は開始ホール → パーティ番号の昇順。
 */
function sortParties(parties: Party[], groups: Map<number, number>, sort: SortState<PartySortKey>): Party[] {
  const sign = sort?.dir === 'desc' ? -1 : 1;
  const group = (p: Party) => groups.get(p.partyNumber) ?? 0;
  return [...parties].sort((a, b) => {
    if (sort?.key === 'startGroup' && group(a) !== group(b)) return (group(a) - group(b)) * sign;
    if (sort?.key === 'startHole' && a.startHole !== b.startHole) return (a.startHole - b.startHole) * sign;
    if (sort?.key === 'startGroup' && a.startHole !== b.startHole) return a.startHole - b.startHole;
    return (a.partyNumber - b.partyNumber) * (sort?.key === 'partyNumber' ? sign : 1);
  });
}

/**
 * A6 組合せ・スコア表。
 * ホール列・スコア入力ダイアログの入力欄とも、開始ホールに関わらず1番ホールから8番ホールの順に固定で並べる（要件定義書3.5）。
 * 開始グループは、同じ開始ホールのパーティにパーティ番号の小さい順で1, 2, 3…と付けた番号（表示時に算出）。
 * パーティ番号・開始グループ・開始ホールの見出しクリックでパーティの表示順を並べ替えられる（表示のみ）。
 * 大会終了・閲覧モードの場合は開始ホールの変更・スコアの入力はできない。
 */
export function PairingsTable({
  tournament,
  competition,
  players,
  parties,
  scores,
  readOnlyReason,
}: {
  tournament: Tournament;
  competition: Competition | null;
  players: Player[];
  parties: Party[];
  scores: Score[];
  readOnlyReason: string | null;
}) {
  const router = useRouter();
  const readOnly = !!readOnlyReason;
  const rounds = competition?.rounds ?? 1;
  const roundList = Array.from({ length: rounds }, (_, i) => i + 1);
  const playerById = new Map(players.map((p) => [p.id, p]));
  const setting = competition ?? { holeInOneConversionEnabled: false, holeInOneConversionValue: null };

  const [startHoleParty, setStartHoleParty] = useState<Party | null>(null);
  const [startHoleDraft, setStartHoleDraft] = useState(1);
  const [scoreTarget, setScoreTarget] = useState<{ party: Party; round: number } | null>(null);
  const [scoreDraft, setScoreDraft] = useState<Record<string, string[]>>({});
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // パーティの並べ替え（見出しクリックで 昇順 → 降順 → 既定（パーティ番号順） と切り替える）
  const [sort, setSort] = useState<SortState<PartySortKey>>(null);
  const onSort = (key: PartySortKey) => setSort((cur) => nextSort(cur, key));
  const startGroups = assignStartGroups(parties);
  // 開始ホール変更ダイアログで選択できない開始ホール（同じ開始グループの他パーティが使用中）
  const unavailableHoles = startHoleParty
    ? unavailableStartHoles(parties, startHoleParty.partyNumber)
    : new Map<number, number>();

  const scoreOf = (playerId: string, round: number) =>
    scores.find((s) => s.playerId === playerId && s.round === round)?.holes;
  const isRoundSaved = (party: Party, round: number) =>
    party.playerIds.length > 0 && party.playerIds.every((pid) => scoreOf(pid, round) !== undefined);

  if (parties.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">まだ組合せ表が作成されていません。</p>
        <Link href={`/tournaments/${tournament.id}`} className="mt-2 inline-block text-sm text-green-700 underline">
          大会情報画面へ戻る
        </Link>
      </div>
    );
  }

  function openStartHole(party: Party) {
    setDialogError(null);
    setStartHoleDraft(party.startHole);
    setStartHoleParty(party);
  }

  async function saveStartHole() {
    if (!startHoleParty) return;
    setBusy(true);
    const res = await apiRequest(
      'PUT',
      `/api/tournaments/${tournament.id}/pairings/${startHoleParty.partyNumber}/start-hole`,
      { startHole: startHoleDraft },
    );
    setBusy(false);
    if (!res.ok) {
      setDialogError(res.error.message);
      return;
    }
    setStartHoleParty(null);
    router.refresh();
  }

  function openScore(party: Party, round: number) {
    const draft: Record<string, string[]> = {};
    for (const pid of party.playerIds) {
      const existing = scoreOf(pid, round);
      // 保存前の入力欄の初期表示値は1（保存されるまでは記録されない）
      draft[pid] = existing ? existing.map(String) : Array(HOLE_COUNT).fill('1');
    }
    setDialogError(null);
    setScoreDraft(draft);
    setScoreTarget({ party, round });
  }

  async function saveScore() {
    if (!scoreTarget) return;
    const payload: Record<string, number[]> = {};
    for (const [pid, holes] of Object.entries(scoreDraft)) {
      const nums = holes.map((h) => (h.trim() === '' ? NaN : Number(h)));
      if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 99)) {
        setDialogError('打数は1〜99の整数で入力してください');
        return;
      }
      payload[pid] = nums;
    }
    setBusy(true);
    const res = await apiRequest('PUT', `/api/tournaments/${tournament.id}/scores`, {
      partyNumber: scoreTarget.party.partyNumber,
      round: scoreTarget.round,
      scores: payload,
    });
    setBusy(false);
    if (!res.ok) {
      setDialogError(res.error.message);
      return;
    }
    setScoreTarget(null);
    router.refresh();
  }

  async function deleteScore() {
    if (!scoreTarget) return;
    setBusy(true);
    const res = await apiRequest('DELETE', `/api/tournaments/${tournament.id}/scores`, {
      partyNumber: scoreTarget.party.partyNumber,
      round: scoreTarget.round,
    });
    setBusy(false);
    setConfirmDelete(false);
    if (!res.ok) {
      setDialogError(res.error.message);
      return;
    }
    setScoreTarget(null);
    router.refresh();
  }

  const cell = 'border-r border-gray-100 px-3 py-2 align-middle';

  return (
    <div className="p-6">
      {readOnlyReason && <p className="mb-3 text-sm text-red-600">{readOnlyReason}</p>}
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="w-full whitespace-nowrap text-center text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <SortHeader sortKey="partyNumber" label="パーティ番号" sort={sort} onSort={onSort} className="px-3 py-2 font-medium" />
              <SortHeader sortKey="startGroup" label="開始グループ" sort={sort} onSort={onSort} className="px-3 py-2 font-medium" />
              <SortHeader sortKey="startHole" label="開始ホール" sort={sort} onSort={onSort} className="px-3 py-2 font-medium" />
              <th className="px-3 py-2 font-medium">選手名</th>
              <th className="px-3 py-2 font-medium">チーム名</th>
              <th className="px-3 py-2 font-medium">生年月日</th>
              <th className="px-3 py-2 font-medium">年齢</th>
              <th className="px-3 py-2 font-medium">ラウンド</th>
              <th className="px-2 py-2 font-medium" colSpan={HOLE_COUNT}>
                ホール
              </th>
              <th className="px-3 py-2 font-medium">小計</th>
              <th className="px-3 py-2 font-medium">合計</th>
              <th className="px-3 py-2 font-medium">スコア入力</th>
            </tr>
          </thead>
          {sortParties(parties, startGroups, sort).map((party) => {
            const partyRowSpan = 1 + party.playerIds.length * rounds;
            return (
              <tbody key={party.partyNumber} data-testid={`party-${party.partyNumber}`} className="border-t-2 border-gray-200">
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <td className={`${cell} text-sm font-semibold text-gray-900`} rowSpan={partyRowSpan}>
                    {party.partyNumber}
                  </td>
                  <td className={`${cell} text-sm text-gray-900`} rowSpan={partyRowSpan} data-testid="start-group">
                    {startGroups.get(party.partyNumber)}
                  </td>
                  <td className={cell} rowSpan={partyRowSpan}>
                    <div className="flex flex-col items-center gap-1 text-sm text-gray-900">
                      <span data-testid="start-hole">{party.startHole}</span>
                      <Button
                        variant="secondary"
                        disabled={readOnly}
                        title={readOnlyReason ?? undefined}
                        onClick={() => openStartHole(party)}
                      >
                        変更
                      </Button>
                    </div>
                  </td>
                  <td colSpan={5} className="px-3 py-1 text-right">
                    ホール番号 →
                  </td>
                  {HOLES.map((h) => (
                    <td key={h} className="px-2 py-1 font-semibold" data-testid="hole-header">
                      {h}
                    </td>
                  ))}
                  <td />
                  <td />
                  <td className="border-l border-gray-100 px-3 py-2 align-middle" rowSpan={partyRowSpan}>
                    <div className="flex flex-col items-center gap-1">
                      {roundList.map((r) => {
                        const saved = isRoundSaved(party, r);
                        const label = (
                          <>
                            ラウンド{r}：
                            {saved ? <Badge tone="success">入力済</Badge> : <Badge>未入力</Badge>}
                          </>
                        );
                        return (
                          <Button
                            key={r}
                            variant="secondary"
                            disabled={readOnly}
                            title={readOnlyReason ?? undefined}
                            onClick={() => openScore(party, r)}
                            className="whitespace-nowrap"
                          >
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
                {party.playerIds.map((pid) => {
                  const player = playerById.get(pid);
                  const saved = roundList.map((r) => scoreOf(pid, r)).filter((h): h is number[] => !!h);
                  const total = overallTotal(saved, setting);
                  return roundList.map((r) => {
                    const holes = scoreOf(pid, r);
                    const first = r === 1;
                    return (
                      <tr key={`${pid}-${r}`} className="border-t border-gray-100" data-testid={`row-${player?.name ?? pid}-${r}`}>
                        {first && (
                          <>
                            <td className={cell} rowSpan={rounds}>
                              {player?.name ?? '（削除された選手）'}
                            </td>
                            <td className={cell} rowSpan={rounds}>
                              {player?.teamName || '-'}
                            </td>
                            <td className={cell} rowSpan={rounds}>
                              {player ? formatSlashDate(player.birthDate) : '-'}
                            </td>
                            <td className={cell} rowSpan={rounds}>
                              {player ? formatAge(calcAge(player.birthDate, tournament.date)) : '-'}
                            </td>
                          </>
                        )}
                        <td className="border-r border-gray-100 px-2 py-2 text-gray-500">R{r}</td>
                        {HOLES.map((h) => {
                          const strokes = holes?.[h - 1];
                          const converted = strokes !== undefined ? holeScore(strokes, setting) : undefined;
                          return (
                            <td key={h} className="px-2 py-2" data-testid="hole-cell">
                              {strokes === undefined ? (
                                'ー'
                              ) : converted !== strokes ? (
                                <span title="ホールインワン（スコア変換）" className="font-semibold text-green-700">
                                  {strokes}
                                  <span className="text-xs">({converted})</span>
                                </span>
                              ) : (
                                strokes
                              )}
                            </td>
                          );
                        })}
                        <td className="border-l border-gray-100 px-3 py-2 font-medium" data-testid="subtotal">
                          {holes ? roundTotal(holes, setting) : 'ー'}
                        </td>
                        {first && (
                          <td className={`${cell} border-l font-semibold`} rowSpan={rounds} data-testid="total">
                            {total ?? 'ー'}
                          </td>
                        )}
                      </tr>
                    );
                  });
                })}
              </tbody>
            );
          })}
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        ※ホールインワン（打数1）は、競技情報で「変換あり」の場合、括弧内の変換値で小計・合計に算入します。
        <br />
        ※スコアを保存しても順位表には自動反映されません。順位表画面で「順位表作成」を実行してください。
      </p>

      <Dialog
        open={startHoleParty !== null}
        onClose={() => setStartHoleParty(null)}
        title={`パーティ${startHoleParty?.partyNumber ?? ''} の開始ホール変更`}
      >
        <div className="space-y-3 text-sm">
          <select
            aria-label="開始ホール"
            className="select"
            value={startHoleDraft}
            onChange={(e) => setStartHoleDraft(Number(e.target.value))}
          >
            {HOLES.map((h) => {
              const usedBy = unavailableHoles.get(h);
              return (
                <option key={h} value={h} disabled={usedBy !== undefined}>
                  {usedBy !== undefined ? `${h}（同じ開始グループのパーティ${usedBy}が使用中）` : h}
                </option>
              );
            })}
          </select>
          <p className="text-xs text-gray-500">同じ開始グループのパーティに割り当て済みの開始ホールは選択できません。</p>
          {dialogError && <p className="text-red-600">{dialogError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setStartHoleParty(null)}>
              キャンセル
            </Button>
            <Button onClick={saveStartHole} disabled={busy}>
              保存
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={scoreTarget !== null}
        wide
        onClose={() => setScoreTarget(null)}
        title={`パーティ${scoreTarget?.party.partyNumber ?? ''} ラウンド${scoreTarget?.round ?? ''} スコア入力`}
      >
        {scoreTarget && (
          <div className="space-y-3">
            <table className="w-full text-center text-sm">
              <thead>
                <tr>
                  <th className="px-1 py-1 text-left">選手</th>
                  {HOLES.map((h) => (
                    <th key={h} className="px-1 py-1">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scoreTarget.party.playerIds.map((pid) => {
                  const player = playerById.get(pid);
                  return (
                    <tr key={pid}>
                      <td className="px-1 py-1 text-left">{player?.name ?? pid}</td>
                      {HOLES.map((h) => (
                        <td key={h} className="px-1 py-1">
                          <input
                            aria-label={`${player?.name ?? pid} ホール${h}`}
                            type="number"
                            min={1}
                            max={99}
                            value={scoreDraft[pid]?.[h - 1] ?? '1'}
                            onChange={(e) => {
                              const value = e.target.value;
                              setScoreDraft((prev) => {
                                const holes = [...(prev[pid] ?? Array(HOLE_COUNT).fill('1'))];
                                holes[h - 1] = value;
                                return { ...prev, [pid]: holes };
                              });
                            }}
                            className="w-12 rounded border border-gray-300 text-center text-sm"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-gray-500">8ホール分をまとめて保存します（ホール単位の部分保存はできません）。</p>
            {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}
            <div className="flex items-center justify-between pt-2">
              <div>
                {isRoundSaved(scoreTarget.party, scoreTarget.round) && (
                  <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                    このラウンドのスコアを削除
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setScoreTarget(null)}>
                  キャンセル
                </Button>
                <Button onClick={saveScore} disabled={busy}>
                  保存
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        title="スコアの削除"
        message="このパーティのこのラウンドのスコアを削除し、未入力に戻します。削除しますか？"
        confirmLabel="削除する"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteScore}
      />
    </div>
  );
}
