"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

export default function LoginPage() {
  const router = useRouter();
  const [showChangeDialog, setShowChangeDialog] = useState(false);

  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [viewerLoading, setViewerLoading] = useState(false);

  const [currentId, setCurrentId] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newId, setNewId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeSuccess, setChangeSuccess] = useState(false);
  const [changing, setChanging] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setLoginError(body.error?.message ?? "ログインに失敗しました");
        return;
      }
      router.push("/tournaments");
      router.refresh();
    } catch {
      setLoginError("通信エラーが発生しました");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleViewerMode() {
    setViewerLoading(true);
    try {
      await fetch("/api/auth/viewer-login", { method: "POST" });
      router.push("/tournaments");
      router.refresh();
    } finally {
      setViewerLoading(false);
    }
  }

  function openChangeDialog() {
    setCurrentId("");
    setCurrentPassword("");
    setNewId("");
    setNewPassword("");
    setChangeError(null);
    setChangeSuccess(false);
    setShowChangeDialog(true);
  }

  async function handleChangeCredentials(e: React.FormEvent) {
    e.preventDefault();
    setChangeError(null);
    setChanging(true);
    try {
      const res = await fetch("/api/auth/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentId, currentPassword, newId, newPassword }),
      });
      const body = await res.json();
      if (!res.ok) {
        setChangeError(body.error?.message ?? "変更に失敗しました");
        return;
      }
      setChangeSuccess(true);
    } catch {
      setChangeError("通信エラーが発生しました");
    } finally {
      setChanging(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-bold text-green-800">
          グランドゴルフしようよ
        </h1>

        <form className="space-y-4" onSubmit={handleLogin}>
          <div>
            <label htmlFor="login-id" className="block text-sm font-medium text-gray-700">ID</label>
            <input
              id="login-id"
              type="text"
              required
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">パスワード</label>
            <input
              id="login-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <Button type="submit" className="w-full" disabled={loggingIn}>
            ログイン
          </Button>
        </form>

        <Button
          variant="secondary"
          className="mt-3 w-full"
          disabled={viewerLoading}
          onClick={handleViewerMode}
        >
          閲覧モードで見る（ID・パスワード不要）
        </Button>

        <button
          className="mt-4 block w-full text-center text-sm text-green-700 underline"
          onClick={openChangeDialog}
        >
          ログイン情報を変更する
        </button>
      </div>

      <Dialog
        open={showChangeDialog}
        onClose={() => setShowChangeDialog(false)}
        title="ログイン情報の変更"
      >
        {changeSuccess ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">ログイン情報を変更しました。</p>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setShowChangeDialog(false)}>閉じる</Button>
            </div>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={handleChangeCredentials}>
            <p className="text-sm text-gray-600">
              本人確認のため、現在のIDとパスワードを入力してください。
            </p>
            <input
              placeholder="現在のID"
              required
              value={currentId}
              onChange={(e) => setCurrentId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="現在のパスワード"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="新しいID"
              required
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="新しいパスワード（最低8文字）"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {changeError && <p className="text-sm text-red-600">{changeError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowChangeDialog(false)}>
                閉じる
              </Button>
              <Button type="submit" disabled={changing}>
                変更する
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </main>
  );
}
