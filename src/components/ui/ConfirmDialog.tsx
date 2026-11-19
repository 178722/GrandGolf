'use client';

import { Button } from './Button';
import { Dialog } from './Dialog';

/** 確認ダイアログ（キャンセル／実行） */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'キャンセル',
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      {message && <div className="text-sm text-gray-600">{message}</div>}
      <div className="flex justify-end gap-2 pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

/** エラーダイアログ（閉じるのみ） */
export function ErrorDialog({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <Dialog open={message !== null} onClose={onClose} title="エラー">
      <p role="alert" className="text-sm text-red-600">
        {message}
      </p>
      <div className="flex justify-end pt-4">
        <Button onClick={onClose}>閉じる</Button>
      </div>
    </Dialog>
  );
}
