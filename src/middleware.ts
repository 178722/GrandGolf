import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from '@/lib/auth/session';

// ログイン画面・認証API・静的アセット以外のすべての管理者向け画面・APIはセッション必須とする（要件定義書4章参照）。
// セッションが無効な状態で画面にアクセスした場合はA1（ログイン画面）へリダイレクトし、APIの場合は401を返す。
export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(request: NextRequest) {
  const sessionValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionCookieValue(sessionValue);

  if (!session) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'ログインしてください' } },
        { status: 401 },
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}
