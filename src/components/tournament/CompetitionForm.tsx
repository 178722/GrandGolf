'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { apiRequest } from '@/lib/client/apiClient';
import { DEFAULT_COMPETITION_FORM, validateCompetitionInput, type FieldErrors } from '@/lib/domain/validation';
import { MESSAGES } from '@/lib/service/errors';
import type { Competition, PartyAssignmentMethod, TeamRankingMethod } from '@/types/tournament';

type FormValues = {
  rounds: number;
  holeInOneConversionEnabled: boolean;
  holeInOneConversionValue: number;
  maxPartySize: number;
  partyAssignmentMethod: PartyAssignmentMethod | null;
  teamBattleEnabled: boolean;
  teamRankingMethod: TeamRankingMethod | null;
};

function toForm(c: Competition | null): FormValues {
  if (!c) return { ...DEFAULT_COMPETITION_FORM };
  return {
    ...c,
    // 変換なしで保存済みの場合も、チェックを入れ直したときはデフォルト値から入力できるようにする
    holeInOneConversionValue: c.holeInOneConversionValue ?? DEFAULT_COMPETITION_FORM.holeInOneConversionValue,
  };
}

/**
 * A4 競技情報の登録・編集フォーム。
 * - ホールインワン時のスコア変換値は「変換あり」にチェックがある時だけ入力できる
 * - チーム戦の順位決定方法は「チーム戦あり」にチェックがある時だけ選択できる
 */
export function CompetitionForm({
  tournamentId,
  competition,
  hasPairings,
  readOnlyReason,
}: {
  tournamentId: string;
  competition: Competition | null;
  hasPairings: boolean;
  readOnlyReason: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(() => toForm(competition));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const disabled = !!readOnlyReason;

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setMessage(null);
  }

  async function save(confirmReset: boolean) {
    const v = validateCompetitionInput(values);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    const res = await apiRequest<Competition>('PUT', `/api/tournaments/${tournamentId}/competition`, {
      competition: values,
      confirmReset,
    });
    setSaving(false);
    if (!res.ok) {
      if (res.error.code === 'CONFIRM_REQUIRED') {
        setConfirmOpen(true);
        return;
      }
      if (res.error.details && typeof res.error.details === 'object') setErrors(res.error.details as FieldErrors);
      setMessage({ tone: 'error', text: res.error.message });
      return;
    }
    setConfirmOpen(false);
    setMessage({ tone: 'ok', text: confirmReset ? '保存しました（組合せ表・スコア表を削除しました）' : '保存しました' });
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <form
        className="rounded-md border border-gray-200 bg-white p-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) save(false);
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">競技情報</h2>
          {/* 閲覧モード・大会終了中・試合結果ありの場合もボタンは非表示にせず disabled で表示する（入力欄は読み取り専用） */}
          <div className="flex items-center gap-2">
            {message && (
              <span role="status" className={`text-sm ${message.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
                {message.text}
              </span>
            )}
            <Button type="submit" disabled={disabled || saving} title={readOnlyReason ?? undefined}>
              保存
            </Button>
          </div>
        </div>
        {!competition && !disabled && (
          <p className="mb-4 text-sm text-amber-700">競技情報が未登録です。内容を確認して「保存」してください。</p>
        )}

        <div className="space-y-4 text-sm">
          <Field label="ラウンド数" error={errors.rounds}>
            <select
              aria-label="ラウンド数"
              disabled={disabled}
              value={values.rounds}
              onChange={(e) => set('rounds', Number(e.target.value))}
              className="select"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>

          <Field label="ホールインワン時のスコア変換" error={errors.holeInOneConversionEnabled}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={values.holeInOneConversionEnabled}
                onChange={(e) => set('holeInOneConversionEnabled', e.target.checked)}
              />
              変換あり
            </label>
          </Field>

          <Field label="ホールインワン時のスコア変換値" error={errors.holeInOneConversionValue}>
            <select
              aria-label="ホールインワン時のスコア変換値"
              disabled={disabled || !values.holeInOneConversionEnabled}
              value={values.holeInOneConversionValue}
              onChange={(e) => set('holeInOneConversionValue', Number(e.target.value))}
              className="select disabled:bg-gray-100 disabled:text-gray-400"
            >
              {[-5, -4, -3, -2, -1, 0, 1].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {!values.holeInOneConversionEnabled && (
              <span className="ml-2 text-xs text-gray-500">「変換あり」の場合のみ入力できます</span>
            )}
          </Field>

          <Field label="パーティの最大人数" error={errors.maxPartySize}>
            <select
              aria-label="パーティの最大人数"
              disabled={disabled}
              value={values.maxPartySize}
              onChange={(e) => set('maxPartySize', Number(e.target.value))}
              className="select"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>

          <Field label="パーティの決定方法" error={errors.partyAssignmentMethod}>
            {(['チーム', 'シャッフル'] as const).map((m) => (
              <label key={m} className="mr-4">
                <input
                  type="radio"
                  name="method"
                  disabled={disabled}
                  checked={values.partyAssignmentMethod === m}
                  onChange={() => set('partyAssignmentMethod', m)}
                />{' '}
                {m}
              </label>
            ))}
          </Field>

          <Field label="チーム戦" error={errors.teamBattleEnabled}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={values.teamBattleEnabled}
                onChange={(e) => set('teamBattleEnabled', e.target.checked)}
              />
              チーム戦あり
            </label>
          </Field>

          <Field label="チーム戦の順位決定方法" error={errors.teamRankingMethod}>
            {(['合計', '平均'] as const).map((m) => (
              <label key={m} className={`mr-4 ${!values.teamBattleEnabled ? 'text-gray-400' : ''}`}>
                <input
                  type="radio"
                  name="teamRanking"
                  disabled={disabled || !values.teamBattleEnabled}
                  checked={values.teamBattleEnabled && values.teamRankingMethod === m}
                  onChange={() => set('teamRankingMethod', m)}
                />{' '}
                {m}
              </label>
            ))}
            {!values.teamBattleEnabled && (
              <span className="text-xs text-gray-500">「チーム戦あり」の場合のみ選択できます</span>
            )}
          </Field>

          {readOnlyReason && <p className="text-red-600">{readOnlyReason}</p>}
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title="組合せ表・スコア表の削除確認"
        message={MESSAGES.confirmReset}
        confirmLabel="変更する"
        busy={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => save(true)}
      />
      {hasPairings && !disabled && (
        <p className="mt-2 text-xs text-gray-500">※組合せ表が作成済みのため、変更すると組合せ表・スコア表の再作成が必要になります。</p>
      )}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-4">
        <span className="w-56 shrink-0 font-medium text-gray-700">{label}</span>
        <div className="flex items-center">{children}</div>
      </div>
      {error && <p className="ml-60 mt-1 text-red-600">{error}</p>}
    </div>
  );
}
