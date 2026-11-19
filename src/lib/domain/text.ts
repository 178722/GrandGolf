// 文字数カウント（「MAX：全角n文字」の判定に使用）。
// 全角・半角を区別せず1文字として数える（サロゲートペアも1文字）。

export function charLength(value: string): number {
  return Array.from(value).length;
}
