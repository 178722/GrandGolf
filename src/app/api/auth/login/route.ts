import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAdminCredentials, verifyAdminPassword } from "@/lib/auth/credentials-store";
import { ROLE_COOKIE_NAME, SESSION_COOKIE_NAME, createSessionCookieValue } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = body?.id;
  const password = body?.password;

  if (typeof id !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "ID・パスワードを入力してください" } },
      { status: 400 },
    );
  }

  const credentials = await getAdminCredentials();
  const passwordOk = await verifyAdminPassword(password);
  if (id !== credentials.id || !passwordOk) {
    return NextResponse.json(
      { error: { code: "invalid_credentials", message: "IDまたはパスワードが正しくありません" } },
      { status: 401 },
    );
  }

  const sessionValue = await createSessionCookieValue("admin");
  const cookieStore = cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionValue, { httpOnly: true, sameSite: "lax", path: "/" });
  cookieStore.set(ROLE_COOKIE_NAME, "admin", { sameSite: "lax", path: "/" });

  return NextResponse.json({ data: { role: "admin" } });
}
