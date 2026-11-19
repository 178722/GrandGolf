'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { nextSort, SortHeader as SortTh, type SortState } from '@/components/ui/SortHeader';
import { apiRequest } from '@/lib/client/apiClient';
import { formatSlashDate } from '@/lib/domain/dates';
import {
  LIMITS,
  isTeamNameRequired,
  validatePlayerInput,
  type FieldErrors,
} from '@/lib/domain/validation';
import { parseBirthDate } from '@/lib/domain/birthDate';
import { MESSAGES } from '@/lib/service/errors';
import type { Competition, Player } from '@/types/tournament';

type Row = {
  key: string;
  id?: string;
  name: string;
  birthDate: string;
  teamName: string;
  partyFixed: boolean;
  partyNumber: number | null;
  absent: boolean;
};

type Draft = Omit<Row, 'key' | 'id' | 'partyNumber' | 'absent'> & { partyNumber: string };

function toRows(players: Player[]): Row[] {
  return players.map((p) => ({
    key: p.id,
    id: p.id,
    name: p.name,
    birthDate: formatSlashDate(p.birthDate),
    teamName: p.teamName,
    partyFixed: p.partyFixed,
    partyNumber: p.partyNumber,
    absent: p.absent,
  }));
}

let tempKey = 0;

type SortKey = 'name' | 'birthDate' | 'teamName' | 'partyFixed';
type Sort = SortState<SortKey>;

const collator = new Intl.Collator('ja');

/** 昇順での比較（チーム名の未入力は末尾、パーティ固定は「固定」→「非固定」、固定同士はパーティ番号順） */
function compareRows(a: Row, b: Row, key: SortKey): number {
  switch (key) {
    case 'name':
      return collator.compare(a.name, b.name);
    case 'birthDate':
      return a.birthDate.localeCompare(b.birthDate);
    case 'teamName':
      if (!a.teamName !== !b.teamName) return a.teamName ? -1 : 1;
      return collator.compare(a.teamName, b.teamName);
    case 'partyFixed':
      if (a.partyFixed !== b.partyFixed) return a.partyFixed ? -1 : 1;
      return (a.partyNumber ?? 0) - (b.partyNumber ?? 0);
  }
}

/** 表示用に並べ替える（登録順は変えない。同じ値の場合は登録順） */
function sortRows(rows: Row[], sort: Sort): Row[] {
  if (!sort) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => compareRows(x.r, y.r, sort.key) * sign || x.i - y.i)
    .map((x) => x.r);
}

/**
 * A5 選手情報の一覧・登録・編集・削除。
 * 新規登録・編集・削除は一覧上で行い、「保存」ボタンでまとめてサーバーへ反映する。
 * 新規登録ダイアログでは「追加して続けて登録」で、ダイアログを閉じずに続けて選手を追加できる。
 * 一覧は選手名・生年月日・チーム名・パーティ固定の見出しクリックで並べ替えられる（表示のみ。登録順は変えない）。
 * 「不参加」ボタンで、選手情報は残したまま組合せ表の生成対象から除外できる（「参加に戻す」で解除）。
 */
export function PlayersEditor({
  tournamentId,
  players,
  competition,
  playerIdsWithResults,
  hasResults,
  readOnlyReason,
}: {
  tournamentId: string;
  players: Player[];
  competition: Competition | null;
  playerIdsWithResults: string[];
  hasResults: boolean;
  readOnlyReason: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => toRows(players));
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<{ key: string | null; draft: Draft } | null>(null);
  const [draftErrors, setDraftErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 連続登録時に直前に追加した選手名（ダイアログ内に表示する）
  const [addedNotice, setAddedNotice] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // 一覧の並べ替え（見出しクリックで 昇順 → 降順 → 登録順 と切り替える）
  const [sort, setSort] = useState<Sort>(null);
  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);

  const toggleSort = (key: SortKey) => setSort((cur) => nextSort(cur, key));
  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <SortTh sortKey={k} label={label} sort={sort} onSort={toggleSort} />
  );
  const disabled = !!readOnlyReason;
  const withResults = useMemo(() => new Set(playerIdsWithResults), [playerIdsWithResults]);
  const teamRequired = isTeamNameRequired(competition);

  const editingRow = editing?.key ? rows.find((r) => r.key === editing.key) : undefined;
  // 試合結果がある場合、既存選手のパーティ固定・パーティ番号・チーム名は変更できない
  const lockPartyFields = hasResults && !!editingRow?.id;

  function openNew() {
    setDraftErrors({});
    setAddedNotice(null);
    setEditing({
      key: null,
      draft: { name: '', birthDate: '', teamName: '', partyFixed: false, partyNumber: '1' },
    });
  }

  function openEdit(row: Row) {
    setDraftErrors({});
    setAddedNotice(null);
    setEditing({
      key: row.key,
      draft: {
        name: row.name,
        birthDate: row.birthDate,
        teamName: row.teamName,
        partyFixed: row.partyFixed,
        partyNumber: String(row.partyNumber ?? 1),
      },
    });
  }

  function setDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, [key]: value } } : e));
  }

  /** 入力内容を一覧へ反映する。continueNext が true の場合（新規登録のみ）はダイアログを閉じずに次の入力へ進む */
  function applyDraft(continueNext = false) {
    if (!editing) return;
    const d = editing.draft;
    const partyNumber = d.partyNumber.trim() === '' ? NaN : Number(d.partyNumber);
    const v = validatePlayerInput({ ...d, partyNumber }, competition);
    const errs: FieldErrors = v.ok ? {} : { ...v.errors };
    const name = d.name.trim();
    if (name && rows.some((r) => r.key !== editing.key && r.name === name))
      errs.name = `選手名「${name}」は既に登録されています`;
    if (Object.keys(errs).length > 0 || !v.ok) {
      setDraftErrors(errs);
      return;
    }
    const value = v.value;
    const row: Row = {
      key: editing.key ?? `new-${++tempKey}`,
      id: editingRow?.id,
      name: value.name,
      birthDate: formatSlashDate(value.birthDate),
      teamName: value.teamName,
      partyFixed: value.partyFixed,
      partyNumber: value.partyNumber,
      absent: editingRow?.absent ?? false,
    };
    setRows((prev) => (editing.key ? prev.map((r) => (r.key === editing.key ? row : r)) : [...prev, row]));
    setDirty(true);
    setMessage(null);
    if (continueNext && !editing.key) {
      // 選手名・生年月日のみクリアし、チーム名・パーティ固定・パーティ番号は続けて同じ値を使えるよう残す
      setDraftErrors({});
      setAddedNotice(value.name);
      setEditing({ key: null, draft: { ...d, name: '', birthDate: '' } });
      nameInputRef.current?.focus();
      return;
    }
    setEditing(null);
  }

  function toggleAbsent(row: Row) {
    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, absent: !r.absent } : r)));
    setDirty(true);
    setMessage(null);
  }

  function removeRow(row: Row) {
    setRows((prev) => prev.filter((r) => r.key !== row.key));
    setDirty(true);
    setMessage(null);
  }

  async function save(confirmReset: boolean) {
    setSaving(true);
    const payload = rows.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      name: r.name,
      birthDate: r.birthDate,
      teamName: r.teamName,
      partyFixed: r.partyFixed,
      partyNumber: r.partyNumber,
      absent: r.absent,
    }));
    const res = await apiRequest<Player[]>('PUT', `/api/tournaments/${tournamentId}/players`, {
      players: payload,
      confirmReset,
    });
    setSaving(false);
    if (!res.ok) {
      if (res.error.code === 'CONFIRM_REQUIRED') {
        setConfirmOpen(true);
        return;
      }
      let text = res.error.message;
      if (res.error.details && typeof res.error.details === 'object') {
        const lines = Object.entries(res.error.details as Record<string, FieldErrors>).map(
          ([i, e]) => `${rows[Number(i)]?.name || `${Number(i) + 1}行目`}：${Object.values(e).join('／')}`,
        );
        text = `${text}（${lines.join('、')}）`;
      }
      setMessage({ tone: 'error', text });
      return;
    }
    setConfirmOpen(false);
    setRows(toRows(res.data));
    setDirty(false);
    setMessage({ tone: 'ok', text: confirmReset ? '保存しました（組合せ表・スコア表を削除しました）' : '保存しました' });
    router.refresh();
  }

  const d = editing?.draft;

  return (
    <div className="p-6">
      <div className="rounded-md border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <Button disabled={disabled} onClick={openNew}>
            + 新規登録
          </Button>
          <div className="flex items-center gap-3">
            {dirty && !message && <span className="text-sm text-amber-700">未保存の変更があります</span>}
            {message && (
              <span role="status" className={`text-sm ${message.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
                {message.text}
              </span>
            )}
            <Button disabled={disabled || saving || !dirty} onClick={() => save(false)}>
              保存
            </Button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <SortHeader k="name" label="選手名" />
              <SortHeader k="birthDate" label="生年月日" />
              <SortHeader k="teamName" label="チーム名" />
              <SortHeader k="partyFixed" label="パーティ固定" />
              <th className="px-4 py-2 font-medium">パーティ番号</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  選手が登録されていません
                </td>
              </tr>
            )}
            {sortedRows.map((r) => {
              const deleteBlocked = !!r.id && withResults.has(r.id);
              // 試合結果がある場合、既存選手の参加／不参加は組合せ表に影響するため変更できない
              const absentBlocked = hasResults && !!r.id;
              return (
                <tr
                  key={r.key}
                  data-testid="player-row"
                  data-absent={r.absent ? 'true' : undefined}
                  className={`border-t border-gray-100 ${r.absent ? 'bg-gray-50 text-gray-400' : ''}`}
                >
                  <td className="px-4 py-3">
                    {r.name}
                    {r.absent && (
                      <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">不参加</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{r.birthDate}</td>
                  <td className="px-4 py-3">{r.teamName || '-'}</td>
                  <td className="px-4 py-3">{r.partyFixed ? '固定' : '非固定'}</td>
                  <td className="px-4 py-3">{r.partyFixed ? r.partyNumber : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" disabled={disabled} onClick={() => openEdit(r)}>
                        編集
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={disabled || absentBlocked}
                        title={absentBlocked ? '試合結果が登録されているため参加／不参加は変更できません' : undefined}
                        onClick={() => toggleAbsent(r)}
                      >
                        {r.absent ? '参加に戻す' : '不参加'}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={disabled || deleteBlocked}
                        title={deleteBlocked ? '試合結果が登録されているため削除できません' : undefined}
                        onClick={() => removeRow(r)}
                      >
                        削除
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {readOnlyReason && <p className="p-4 text-sm text-red-600">{readOnlyReason}</p>}
        {!readOnlyReason && hasResults && (
          <p className="p-4 text-xs text-gray-500">
            ※試合結果が登録されているため、パーティ固定・パーティ番号・チーム名・参加／不参加の変更、および試合結果のある選手の削除はできません。
          </p>
        )}
      </div>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.key ? '選手情報の編集' : '選手情報の新規登録'}
      >
        {d && (
          <div className="space-y-3 text-sm">
            {addedNotice && (
              <p role="status" className="rounded bg-green-50 px-3 py-2 text-green-800">
                「{addedNotice}」を一覧に追加しました。続けて入力できます。
              </p>
            )}
            <Field label={`選手名（最大${LIMITS.playerName}文字）`} required error={draftErrors.name}>
              <input
                ref={nameInputRef}
                aria-label="選手名"
                className="input"
                value={d.name}
                onChange={(e) => setDraft('name', e.target.value)}
              />
            </Field>
            <Field label="生年月日" required error={draftErrors.birthDate}>
              <input
                aria-label="生年月日"
                className="input"
                placeholder="YYYY/MM/DD または S46.05.24"
                value={d.birthDate}
                onChange={(e) => setDraft('birthDate', e.target.value)}
              />
              {d.birthDate && parseBirthDate(d.birthDate) && (
                <p className="mt-1 text-xs text-gray-500">→ {formatSlashDate(parseBirthDate(d.birthDate) as string)}</p>
              )}
            </Field>
            <Field label={`チーム名（最大${LIMITS.teamName}文字）`} required={teamRequired} error={draftErrors.teamName}>
              <input
                aria-label="チーム名"
                className="input disabled:bg-gray-100"
                disabled={lockPartyFields}
                value={d.teamName}
                onChange={(e) => setDraft('teamName', e.target.value)}
              />
            </Field>
            <Field label="パーティ固定" error={draftErrors.partyFixed}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={lockPartyFields}
                  checked={d.partyFixed}
                  onChange={(e) => setDraft('partyFixed', e.target.checked)}
                />{' '}
                固定
              </label>
            </Field>
            <Field label="パーティ番号（1〜99）" error={draftErrors.partyNumber}>
              <input
                aria-label="パーティ番号"
                className="input disabled:bg-gray-100"
                type="number"
                min={1}
                max={99}
                disabled={lockPartyFields || !d.partyFixed}
                value={d.partyNumber}
                onChange={(e) => setDraft('partyNumber', e.target.value)}
              />
            </Field>
            {lockPartyFields && (
              <p className="text-xs text-gray-500">試合結果が登録されているため、チーム名・パーティ固定・パーティ番号は変更できません。</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                {addedNotice ? '閉じる' : 'キャンセル'}
              </Button>
              {!editing?.key && (
                <Button variant="secondary" onClick={() => applyDraft(true)}>
                  追加して続けて登録
                </Button>
              )}
              <Button onClick={() => applyDraft()}>保存して閉じる</Button>
            </div>
            <p className="text-xs text-gray-500">※一覧の「保存」ボタンを押すまでサーバーには反映されません。</p>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title="組合せ表・スコア表の削除確認"
        message={MESSAGES.confirmReset}
        confirmLabel="変更する"
        busy={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => save(true)}
      />
    </div>
  );
}

function Field({
  label,
  required = false,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-red-600">{error}</p>}
    </div>
  );
}
