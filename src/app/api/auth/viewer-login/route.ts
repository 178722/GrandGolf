import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ROLE_COOKIE_NAME, SESSION_COOKIE_NAME, createSessionCookieValue } from "@/lib/auth/session";

// 閲覧モード：ID・パスワードなしで読み取り専用セッションを発行する（要件定義書2.3参照）。
export async function POST() {
  const sessionValue = await createSessionCookieValue("viewer");
  const cookieStore = cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionValue, { httpOnly: true, sameSite: "lax", path: "/" });
  cookieStore.set(ROLE_COOKIE_NAME, "viewer", { sameSite: "lax", path: "/" });

  return NextResponse.json({ data: { role: "viewer" } });
}
