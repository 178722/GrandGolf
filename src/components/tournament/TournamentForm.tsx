'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { apiRequest } from '@/lib/client/apiClient';
import { LIMITS, validateTournamentInput, type FieldErrors } from '@/lib/domain/validation';
import type { Tournament } from '@/types/tournament';

type Values = { name: string; date: string; place: string };

/**
 * A3 大会情報の登録・編集フォーム。
 * 大会名・開催場所の入力欄は、最大文字数（全角50文字）を入力してもスクロールしない横幅（56em）にする。
 */
export function TournamentForm({
  tournament,
  defaultDate,
  readOnlyReason,
}: {
  /** 編集時の大会（新規作成時は未指定） */
  tournament?: Tournament;
  /** 新規作成時の開催日のデフォルト（登録日） */
  defaultDate?: string;
  /** 編集不可の理由（大会終了・閲覧モード） */
  readOnlyReason?: string | null;
}) {
  const router = useRouter();
  const isNew = !tournament;
  const initial: Values = tournament
    ? { name: tournament.name, date: tournament.date, place: tournament.place }
    : { name: '', date: defaultDate ?? '', place: '' };
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const disabled = !!readOnlyReason;

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    const v = validateTournamentInput(values);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    const res = isNew
      ? await apiRequest<Tournament>('POST', '/api/tournaments', values)
      : await apiRequest<Tournament>('PUT', `/api/tournaments/${tournament.id}`, values);
    setSaving(false);
    if (!res.ok) {
      if (res.error.details && typeof res.error.details === 'object') setErrors(res.error.details as FieldErrors);
      setMessage({ tone: 'error', text: res.error.message });
      return;
    }
    if (isNew) {
      router.push(`/tournaments/${res.data.id}`);
      router.refresh();
    } else {
      setMessage({ tone: 'ok', text: '保存しました' });
      router.refresh();
    }
  }

  function handleCancel() {
    if (isNew) router.push('/tournaments');
    else {
      setValues(initial);
      setErrors({});
      setMessage(null);
    }
  }

  const inputClass =
    'mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-600';

  return (
    <div className="mx-auto max-w-4xl p-6">
      <form className="rounded-md border border-gray-200 bg-white p-6" onSubmit={handleSubmit} noValidate>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{isNew ? '大会情報登録' : '大会情報'}</h2>
          {/* 閲覧モード・大会終了中もボタンは非表示にせず disabled で表示する（入力欄は読み取り専用） */}
          <div className="flex items-center gap-2">
            {message && (
              <span role="status" className={`text-sm ${message.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
                {message.text}
              </span>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              title={readOnlyReason ?? undefined}
              onClick={handleCancel}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={disabled || saving} title={readOnlyReason ?? undefined}>
              保存
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="t-name" className="block text-sm font-medium text-gray-700">
              大会名（最大{LIMITS.tournamentName}文字） <span className="text-red-500">*</span>
            </label>
            <input
              id="t-name"
              value={values.name}
              disabled={disabled}
              onChange={(e) => set('name', e.target.value)}
              className={`${inputClass} w-[56em]`}
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="t-date" className="block text-sm font-medium text-gray-700">
              開催日 <span className="text-red-500">*</span>
            </label>
            <input
              id="t-date"
              type="date"
              value={values.date}
              disabled={disabled}
              onChange={(e) => set('date', e.target.value)}
              className={`${inputClass} w-48`}
            />
            {errors.date && <p className="mt-1 text-sm text-red-600">{errors.date}</p>}
          </div>
          <div>
            <label htmlFor="t-place" className="block text-sm font-medium text-gray-700">
              開催場所（最大{LIMITS.place}文字） <span className="text-red-500">*</span>
            </label>
            <input
              id="t-place"
              value={values.place}
              disabled={disabled}
              onChange={(e) => set('place', e.target.value)}
              className={`${inputClass} w-[56em]`}
            />
            {errors.place && <p className="mt-1 text-sm text-red-600">{errors.place}</p>}
          </div>
          {readOnlyReason && <p className="text-sm text-red-600">{readOnlyReason}</p>}
        </div>
      </form>
    </div>
  );
}
