// 管理者ID・パスワードのJSONストア（要件定義書4章参照）。
// 初回アクセス時に環境変数（ADMIN_ID / ADMIN_PASSWORD）からシードし、
// 以降は data/admin.json（GRANDGOLF_DATA_DIR配下）に保存する。
// bcryptjsでのハッシュ化・ファイルIOを行うため、Node runtimeのAPI Routeからのみ呼び出すこと（ミドルウェアからは呼び出さない）。

import bcrypt from "bcryptjs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

type AdminCredentials = {
  id: string;
  passwordHash: string;
};

const SALT_ROUNDS = 10;

function getDataDir(): string {
  return process.env.GRANDGOLF_DATA_DIR ?? "./data";
}

function getAdminFilePath(): string {
  return path.join(getDataDir(), "admin.json");
}

async function seedFromEnv(): Promise<AdminCredentials> {
  const id = process.env.ADMIN_ID;
  const password = process.env.ADMIN_PASSWORD;
  if (!id || !password) {
    throw new Error(
      "環境変数 ADMIN_ID / ADMIN_PASSWORD が設定されていません（.env.local を確認してください）",
    );
  }

  const credentials: AdminCredentials = {
    id,
    passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
  };

  await mkdir(getDataDir(), { recursive: true });
  await writeFile(getAdminFilePath(), JSON.stringify(credentials, null, 2), "utf-8");
  return credentials;
}

export async function getAdminCredentials(): Promise<AdminCredentials> {
  try {
    const raw = await readFile(getAdminFilePath(), "utf-8");
    return JSON.parse(raw) as AdminCredentials;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return seedFromEnv();
    }
    throw err;
  }
}

export async function updateAdminCredentials(id: string, password: string): Promise<void> {
  const credentials: AdminCredentials = {
    id,
    passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
  };
  await mkdir(getDataDir(), { recursive: true });
  await writeFile(getAdminFilePath(), JSON.stringify(credentials, null, 2), "utf-8");
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const { passwordHash } = await getAdminCredentials();
  return bcrypt.compare(password, passwordHash);
}
