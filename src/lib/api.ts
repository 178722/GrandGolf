// API Route Handlers 共通ヘルパー。
// レスポンス形式：成功時 { data: ... }、失敗時 { error: { code, message, details? } }

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionCookieValue, type SessionRole } from '@/lib/auth/session';
import { AppError, MESSAGES } from '@/lib/service/errors';

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status });
}

export async function getSessionRole(): Promise<SessionRole | null> {
  const session = await verifySessionCookieValue(cookies().get(SESSION_COOKIE_NAME)?.value);
  return session?.role ?? null;
}

/** ログイン済み（閲覧モード含む）であることを要求する */
export async function requireSession(): Promise<SessionRole> {
  const role = await getSessionRole();
  if (!role) throw new AppError('UNAUTHORIZED', 'ログインしてください');
  return role;
}

/** 管理者であることを要求する（閲覧モードではデータを書き換える操作をAPIレベルでも拒否する） */
export async function requireAdmin(): Promise<void> {
  const role = await requireSession();
  if (role !== 'admin') throw new AppError('FORBIDDEN', MESSAGES.viewer);
}

/** ハンドラ内の AppError を所定のエラーレスポンスに変換する */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) return fail(err.code, err.message, err.status, err.details);
    console.error(err);
    return fail('INTERNAL_ERROR', 'サーバーでエラーが発生しました', 500);
  }
}

/** リクエストボディをJSONとして読み込む。不正なJSONは VALIDATION_ERROR とする */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    throw new AppError('VALIDATION_ERROR', 'リクエストの形式が正しくありません');
  }
}

export function parsePartyNumber(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new AppError('NOT_FOUND', 'パーティが見つかりません');
  return n;
}
