// ブラウザからAPIを呼び出すためのヘルパー

export type ApiError = { code: string; message: string; details?: unknown };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export async function apiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: json?.error ?? { code: 'HTTP_ERROR', message: `エラーが発生しました（${res.status}）` },
      };
    }
    return { ok: true, data: json?.data as T };
  } catch {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: '通信エラーが発生しました' } };
  }
}
