// Next.jsサーバーの起動・ポート選定・起動確認ヘルパー。
// Electronメインプロセス（electron/main.ts）から呼び出す。Electron APIに依存しない純粋なNode.js処理のみを置く。

import http from 'http';
import net from 'net';

// 127.0.0.1上で空いているTCPポートをOSに割り当ててもらい、その番号を返す。
// 既定ポート（3000等）が他アプリで使用中でも起動できるよう、固定ポートは使わない。
export function findFreePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('空きポートを取得できませんでした')));
      }
    });
  });
}

// 指定URLにHTTPリクエストを送り、レスポンスが返る（ステータスコードは問わない）ことを確認する。
function ping(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// サーバーが応答するまでポーリングして待つ。タイムアウトした場合は例外を投げる。
// isAlive が false を返した場合（子プロセスが異常終了した等）は待たずに失敗させる。
export async function waitForServer(
  url: string,
  options: { timeoutMs?: number; intervalMs?: number; isAlive?: () => boolean } = {},
): Promise<void> {
  const { timeoutMs = 60_000, intervalMs = 300, isAlive = () => true } = options;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) {
      throw new Error('サーバープロセスが起動途中で終了しました');
    }
    if (await ping(url)) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`サーバーの起動確認がタイムアウトしました（${timeoutMs / 1000}秒）`);
}
