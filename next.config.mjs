/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // クライアント側ルーターキャッシュで動的ページを再利用しない（既定は30秒）。
    // 復元・他画面での更新の直後に画面遷移した際、古い内容が表示されることを防ぐ
    // （単一PC内で完結するアプリのため、遷移のたびにサーバーから取得しても性能上の問題はない）。
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
