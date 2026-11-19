"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ROLE_COOKIE_NAME } from "@/lib/auth/session";

function readRoleCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${ROLE_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function AdminHeader() {
  const router = useRouter();
  const [logoutStep, setLogoutStep] = useState<0 | 1 | 2>(0);
  const [isViewerMode, setIsViewerMode] = useState(false);

  useEffect(() => {
    setIsViewerMode(readRoleCookie() === "viewer");
  }, []);

  // 「バックアップする」を選んだ場合のみ、ログアウトの契機でバックアップを作成する（要件定義書4章）
  async function handleLogoutConfirm(backup: boolean) {
    setLogoutStep(0);
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backup }),
    });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3">
        <Link href="/tournaments" className="text-lg font-bold text-green-800">
          グランドゴルフしようよ
        </Link>
        {isViewerMode && <Badge tone="warning">閲覧モード</Badge>}
      </div>
      <div className="flex items-center gap-2">
        <Link href="/settings/backup">
          <Button variant="secondary">バックアップ</Button>
        </Link>
        <Button variant="ghost" onClick={() => setLogoutStep(1)}>
          ログアウト
        </Button>
      </div>

      <Dialog open={logoutStep === 1} onClose={() => setLogoutStep(0)} title="ログアウトしますか？">
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => setLogoutStep(0)}>
            しない
          </Button>
          <Button onClick={() => setLogoutStep(2)}>ログアウトする</Button>
        </div>
      </Dialog>

      <Dialog open={logoutStep === 2} onClose={() => setLogoutStep(0)} title="バックアップを作成しますか？">
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => handleLogoutConfirm(false)}>
            しない
          </Button>
          <Button onClick={() => handleLogoutConfirm(true)} disabled={isViewerMode}>
            バックアップする
          </Button>
        </div>
      </Dialog>
    </header>
  );
}
