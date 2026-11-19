import { NextRequest, NextResponse } from "next/server";
import { getAdminCredentials, updateAdminCredentials, verifyAdminPassword } from "@/lib/auth/credentials-store";

// ログインID・パスワードの変更。未ログイン状態でも、現在のID・パスワードの入力を本人確認として実行できる（要件定義書4章参照）。
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const currentId = body?.currentId;
  const currentPassword = body?.currentPassword;
  const newId = body?.newId;
  const newPassword = body?.newPassword;

  if (
    typeof currentId !== "string" ||
    typeof currentPassword !== "string" ||
    typeof newId !== "string" ||
    typeof newPassword !== "string" ||
    !newId
  ) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "すべての項目を入力してください" } },
      { status: 400 },
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: { code: "invalid_password", message: "新しいパスワードは最低8文字以上で入力してください" } },
      { status: 400 },
    );
  }

  const credentials = await getAdminCredentials();
  const currentOk = currentId === credentials.id && (await verifyAdminPassword(currentPassword));
  if (!currentOk) {
    return NextResponse.json(
      { error: { code: "invalid_credentials", message: "現在のID・パスワードが正しくありません" } },
      { status: 401 },
    );
  }

  await updateAdminCredentials(newId, newPassword);
  return NextResponse.json({ data: { ok: true } });
}
