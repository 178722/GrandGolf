// Electronメインプロセス。
// アプリ同梱のNext.jsサーバー（next start）をElectron同梱のNodeランタイム上で起動し、
// 起動確認後にBrowserWindowで表示する（システムへのNode.js事前インストールは不要）。

import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  shell,
  utilityProcess,
  type MenuItemConstructorOptions,
  type UtilityProcess,
} from 'electron';
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { findFreePort, waitForServer } from './server';

const PRODUCT_NAME = 'グランドゴルフしようよ';
const HOST = '127.0.0.1';

// 初期管理者アカウント（データ保存先に admin.json が無い初回起動時のみ使用される）。
// ログイン画面の「ログイン情報を変更する」からいつでも変更できる（インストール手順書に記載）。
const INITIAL_ADMIN_ID = 'TakunishiSC';
const INITIAL_ADMIN_PASSWORD = '0962778801';

let serverProcess: UtilityProcess | null = null;
let mainWindow: BrowserWindow | null = null;

// データ保存先を決める。
// 同一PC内の複数OSユーザーで同じ大会データを共有できるよう、マシン単位の共有ディレクトリを使う。
// - Windows: %ProgramData%\<製品名>（標準ユーザーでも書き込み可能）
// - macOS: /Library/Application Support/<製品名>（作成には管理者権限が必要。初回起動は管理者アカウントで行う）
// - それ以外（開発用Linux等）: Electron標準のユーザーデータディレクトリ
function resolveSharedDataDir(): string {
  if (process.platform === 'win32') {
    const programData = process.env.ProgramData ?? 'C:\\ProgramData';
    return path.join(programData, PRODUCT_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join('/Library/Application Support', PRODUCT_NAME);
  }
  return app.getPath('userData');
}

// データ保存先を作成し、書き込み可能であることを確認する。
function ensureDataDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.W_OK);
}

// セッションCookie署名用の秘密鍵。初回起動時に乱数で生成してデータ保存先に保存し、以降は同じ値を使う
// （再起動のたびに変わるとログイン状態が切れるため）。
function loadOrCreateSessionSecret(dataDir: string): string {
  const file = path.join(dataDir, 'session-secret.json');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8')) as { secret?: string };
    if (saved.secret) return saved.secret;
  } catch {
    // 未作成・破損時は作り直す
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, JSON.stringify({ secret }, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return secret;
}

// Next.jsサーバーを子プロセス（utilityProcess）として起動し、URLを返す。
async function startNextServer(dataDir: string): Promise<string> {
  const appDir = app.getAppPath();
  const port = await findFreePort(HOST);
  const nextBin = require.resolve('next/dist/bin/next', { paths: [appDir] });

  const logDir = path.join(dataDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.createWriteStream(path.join(logDir, 'server.log'), { flags: 'w' });

  serverProcess = utilityProcess.fork(nextBin, ['start', '-p', String(port), '-H', HOST], {
    cwd: appDir,
    stdio: 'pipe',
    serviceName: `${PRODUCT_NAME} サーバー`,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      GRANDGOLF_DATA_DIR: dataDir,
      ADMIN_ID: INITIAL_ADMIN_ID,
      ADMIN_PASSWORD: INITIAL_ADMIN_PASSWORD,
      SESSION_SECRET: loadOrCreateSessionSecret(dataDir),
    },
  });
  serverProcess.stdout?.pipe(log);
  serverProcess.stderr?.pipe(log);

  let alive = true;
  serverProcess.on('exit', () => {
    alive = false;
    serverProcess = null;
  });

  const url = `http://${HOST}:${port}`;
  await waitForServer(`${url}/login`, { timeoutMs: 90_000, isAlive: () => alive });
  return url;
}

function createWindow(url: string): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: PRODUCT_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // アプリ外（http://127.0.0.1:<port> 以外）へのリンクは既定のブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(url)) return { action: 'allow' };
    void shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(url);
}

// インストール時に同梱した操作手順書（resources/操作手順書.md）のパス
function manualPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, '操作手順書.md')
    : path.join(app.getAppPath(), 'docs', '操作手順書.md');
}

// 操作手順書をOSの既定アプリで開く。
// Windowsで .md に関連付けられたアプリが無い場合は、標準搭載のメモ帳で開く。
async function openManual(): Promise<void> {
  const file = manualPath();
  const error = await shell.openPath(file);
  if (!error) return;
  if (process.platform === 'win32') {
    spawn('notepad.exe', [file], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  dialog.showErrorBox('操作手順書を開けません', `${file}\n${error}`);
}

// アプリケーションメニュー（標準の編集・表示操作に加え、ヘルプから操作手順書を開けるようにする）
function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu', label: 'ファイル' },
    { role: 'editMenu', label: '編集' },
    { role: 'viewMenu', label: '表示' },
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: '操作手順書を開く',
          click: () => {
            void openManual();
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function stopServer(): void {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

async function bootstrap(): Promise<void> {
  buildMenu();
  const dataDir = resolveSharedDataDir();
  try {
    ensureDataDir(dataDir);
  } catch (err) {
    dialog.showErrorBox(
      `${PRODUCT_NAME} を起動できません`,
      `データ保存先フォルダを作成できませんでした。\n${dataDir}\n\n` +
        (process.platform === 'darwin'
          ? '初回起動は、管理者権限のあるアカウントで行ってください。\n\n'
          : '') +
        `詳細: ${(err as Error).message}`,
    );
    app.quit();
    return;
  }

  try {
    const url = await startNextServer(dataDir);
    createWindow(url);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
    });
  } catch (err) {
    stopServer();
    dialog.showErrorBox(
      `${PRODUCT_NAME} を起動できません`,
      `アプリ内部のサーバーを起動できませんでした。\n` +
        `ログ: ${path.join(dataDir, 'logs', 'server.log')}\n\n詳細: ${(err as Error).message}`,
    );
    app.quit();
  }
}

// 二重起動を防ぐ（2つ目の起動時は既存ウィンドウを前面に出す）
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(bootstrap);
  app.on('window-all-closed', () => {
    // macOSでもウィンドウを閉じたらアプリを終了する（サーバーを残さないため）
    app.quit();
  });
  app.on('before-quit', stopServer);
}
