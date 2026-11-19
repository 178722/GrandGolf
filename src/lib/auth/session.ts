// Cookieベースの簡易セッション実装（要件定義書4章参照）。
// ミドルウェア（Edge runtime）とAPI Routes（Node runtime）の両方から呼び出すため、
// 状態をサーバーに保持せず、Web Crypto（両ランタイムで利用可能）によるHMAC署名付きCookieのみで完結させる。

export const SESSION_COOKIE_NAME = "gg_session";
// クライアント側（閲覧モードバッジ表示等のUI用）にのみ公開する非httpOnlyなロール情報。
// セキュリティ上の判定には使用しない。
export const ROLE_COOKIE_NAME = "gg_role";

export type SessionRole = "admin" | "viewer";

export type SessionPayload = {
  role: SessionRole;
  iat: number;
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("環境変数 SESSION_SECRET が設定されていません（.env.local を確認してください）");
  }
  return secret;
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacSign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(signature));
}

export async function createSessionCookieValue(role: SessionRole): Promise<string> {
  const payload: SessionPayload = { role, iat: Date.now() };
  const payloadPart = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signaturePart = await hmacSign(payloadPart);
  return `${payloadPart}.${signaturePart}`;
}

export async function verifySessionCookieValue(value: string | undefined): Promise<SessionPayload | null> {
  if (!value) return null;
  const [payloadPart, signaturePart] = value.split(".");
  if (!payloadPart || !signaturePart) return null;

  const expectedSignature = await hmacSign(payloadPart);
  if (expectedSignature !== signaturePart) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadPart))) as SessionPayload;
    if (payload.role !== "admin" && payload.role !== "viewer") return null;
    return payload;
  } catch {
    return null;
  }
}
