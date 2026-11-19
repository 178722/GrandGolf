# CLAUDE.md

このファイルは、本リポジトリでコードを書くAIエージェント（Claude Code）および開発者向けのガイドです。

## プロジェクト概要

**グランドゴルフしようよ**（グランドゴルフ大会運営管理システム。大会ごとの名称は利用者が個別に設定する）

背景・目的の詳細は `docs/要件定義書.md` の「1. システム概要」を参照してください。

要件の一次情報源は `docs/要件定義書.md` です。本ファイルとの間に齟齬がある場合は **要件定義書を優先** してください。要件定義書に書かれていない仕様を推測で補わず、不明点はユーザーに確認してください。

本プロジェクトは `BaseProject/`（団体スポーツのリーグ戦管理システム「リーグ戦しようよ」）をベースに開発する。ただしBaseProjectは「チーム対戦・総当たりリーグ・コート・審判割当」というドメインであり、グランドゴルフは「個人/パーティ単位でホールごとの打数を記録するゴルフ形式のスコア集計」であるため、ドメインロジック（組合せ表・スコア表・順位表まわり）はBaseProjectのリーグ戦ロジックをそのまま転用せず、`docs/要件定義書.md` の内容に従って新たに設計・実装すること。アーキテクチャ・技術スタック・非ドメイン部分（認証、バックアップ、Electron化、Git運用等）はBaseProjectの方式を踏襲する。

## 現在の状態（重要）

- Next.js 14（App Router）＋ファイルベースJSONストア（`<GRANDGOLF_DATA_DIR>/db.json`、バックアップは同 `backups/`）で、A1〜A8の画面・API・業務ロジックを実装済み。
- Electron化済み（デスクトップアプリとしてmacOS/Windowsへ配布）。
  - 構成：`electron/main.ts`（メインプロセス。アプリ同梱のNext.jsサーバー（`next start`）を `utilityProcess` でElectron同梱のNodeランタイム上に起動し、`127.0.0.1` の空きポートで起動確認後にBrowserWindowで表示。二重起動防止、アプリケーションメニュー「ヘルプ」→「操作手順書を開く」）・`electron/server.ts`（空きポート選定・起動確認）。コンパイル設定は `tsconfig.electron.json`（出力 `dist-electron/`）、electron-builderの設定は `package.json` の `build`（`asar: false`、出力 `dist-installer/`、dmgボリューム名 `GrandGolf ${version}`、`docs/操作手順書.md` を `extraResources` で `resources/操作手順書.md` として同梱）。
  - コマンド：`npm run electron:compile`（`electron/` のTypeScriptコンパイル）、`npm run electron:start`（Next.jsビルド＋コンパイルしてElectronで起動）、`npm run electron:build`（実行中OS向けインストーラ）、`npm run electron:build:mac`（.dmg：arm64・x64）、`npm run electron:build:win`（.exe：NSIS・x64）。開発コンテナ（Linux）ではmacOS/Windows向けインストーラを作成できない。
  - GitHub Actions（`.github/workflows/electron-build.yml`）でビルドする（Macは `macos-15-intel` ランナー、Windowsは `windows-latest`）。トリガーは `workflow_dispatch`（手動実行）・`installer-test` ブランチへのpush（試験ビルド。成果物はActionsのArtifactsに保存）・`v*` タグのpush（リリースビルド。成果物をGitHub Releaseに添付）。
  - データ保存先（同一PCの全OSユーザーで共有）：Windows `%ProgramData%\グランドゴルフしようよ`、macOS `/Library/Application Support/グランドゴルフしようよ`（作成に管理者権限が必要なため、初回起動は管理者アカウントで行う）。`electron/main.ts` が子プロセスの `GRANDGOLF_DATA_DIR` に設定する。セッション署名鍵は同フォルダの `session-secret.json`（初回起動時に生成）、サーバーログは `logs/server.log`。
  - 初期管理者アカウントは `electron/main.ts` の定数（`INITIAL_ADMIN_ID`・`INITIAL_ADMIN_PASSWORD`）で、子プロセスの `ADMIN_ID`・`ADMIN_PASSWORD` として渡す（`admin.json` が無い初回のみ使用）。値はインストール手順書（`installer/Mac/`・`installer/Windows/`）に記載しているため、変更時は両方を合わせて更新する。
  - 制約：macOSはアドホック署名のみ（`build.mac.identity: "-"`。Apple Developer IDでの署名・公証なし）のため、利用者が `xattr -cr` で検疫属性を解除する必要がある。Windowsはコード署名なしのため、インストール時にMicrosoft Defender SmartScreenの警告が出る（「詳細情報」→「実行」）。いずれもインストール手順書に記載。
- Gitリポジトリ化済み（「Gitワークフロー」の作業コミット運用を適用中。リリースタグは未付与）。
- 採用済み：Next.js・Tailwind CSS・bcryptjs・Vitest・Playwright・Electron・electron-builder。未採用：shadcn/ui・React Hook Form・Zod・date-fns・exceljs・Prettier（入力検証は `src/lib/domain/validation.ts` の自前関数をフォームとAPIで共用し、日付は `Intl.DateTimeFormat` と自前関数（`src/lib/domain/dates.ts`）で扱う）。新たな依存の追加は引き続きユーザーに確認すること。
- Node.jsのバージョン：開発コンテナのNode.jsは18系（`package.json` の `engines` は `>=18.18.0`）のため、PlaywrightはNode 18対応の1.52系を使用している。`.nvmrc`（22）はGitHub Actionsのビルド（`actions/setup-node` の `node-version-file`）で使用する。配布版はElectron同梱のNodeランタイムで動作するため、利用者のPCにNode.jsは不要。
- 要件定義書の3.4〜3.7（組合せ表生成・開始ホール自動割当・スコア表生成・スコア入力計算・順位表作成）は、グランドゴルフ固有のドメインロジックであり、実装時に誤りやすい核心部分です。要約だけに頼らず必ず要件定義書の原文を確認してください。
- 主要なコード配置：
  - `src/lib/domain/` … 純粋関数（バリデーション・生年月日解析・年齢・組合せ生成・スコア計算・順位決定）
  - `src/lib/service/tournamentService.ts` … ブロック系ルール・カスケード削除などストアを伴う業務ロジック
  - `src/lib/store/` … JSONストア・バックアップ
  - `src/app/api/` … Route Handlers（`src/lib/api.ts` の共通ヘルパーで認証・エラー形式を統一）
- コマンド：
  - `npm run dev` … 開発サーバー
  - `npm test` … ユニットテスト（Vitest。ケース一覧は `docs/ユニットテスト.md`）
  - `npm run test:integration` … 結合テスト（Playwright。ポート3100・データ保存先 `.test-data` で開発サーバーを自動起動。ケース一覧は `docs/結合テスト.md`）
  - `npm run test:e2e` … E2Eテスト（Playwright。`playwright.e2e.config.ts`。ポート3200・データ保存先 `.e2e-data` で開発サーバーを自動起動。シナリオ一覧は `docs/E2Eテスト.md`）。結合テストと `.next` を共有するため同時に実行しないこと
  - `npm run typecheck` / `npm run lint`
  - Electron関連のコマンドは上記「Electron化済み」を参照
- ドキュメント（`docs/`）：要件定義書・画面仕様書・データベース仕様書・API仕様書・用語集・操作手順書（利用者向け。アプリに同梱）・ユニットテスト／結合テスト／E2Eテスト（ケース一覧）と各 `(結果)〜.md`（実施結果）。インストール手順書は `installer/Mac/`・`installer/Windows/` に置く。実装を変更した場合は関連する文書も合わせて更新すること。

## 技術スタック

大会当日、インターネット接続の有無に関わらず運営者のPC1台だけで完結して動作する構成として、BaseProjectと同じ技術を基本に以下を採用している。当初の想定から変更・未採用となったものは表中に注記する。

| 領域 | 採用技術 |
|---|---|
| フロントエンド | Next.js (React + TypeScript) |
| バックエンド | Next.js API Routes（App RouterのRoute Handlers、Node.js） |
| DB | ファイルベースJSONストア（Electron配布時は同一PCの全OSユーザーで共有するマシン単位のディレクトリに保存。「現在の状態」参照） |
| 認証 | Cookieベースの簡易セッション実装。パスワードはbcryptjsでハッシュ化しJSONストアへ保存。単一PCでのオフライン動作が前提のためHTTPS通信は必須としない |
| データ出力 | （未採用・将来対応）exceljsで大会全体のデータを1つのExcel（.xlsx）ファイルにまとめて出力する想定。要件定義書3.8・5章により今回のスコープ外 |
| ホスティング | Electronによるデスクトップアプリ配布（macOS/Windows）。アプリ内でNext.jsサーバーを起動し、BrowserWindowで表示する |
| パッケージング | Electron + electron-builder |
| Router | Next.js App Router（`src/app/`） |
| TypeScript | `tsconfig.json` で `strict: true` を有効化 |
| パッケージ管理 | npm |
| Node.js | `.nvmrc` は22（GitHub Actionsのビルドで使用）。開発コンテナは18系のため `package.json` の `engines` は `>=18.18.0`（「現在の状態」参照） |
| UI | Tailwind CSS（shadcn/uiは未採用。共通部品は `src/components/ui/` に自前で実装） |
| テスト（単体） | Vitest |
| テスト（結合・E2E） | Playwright（開発サーバーに対して実施する） |
| 日付/タイムゾーン | ストアはUTC保存、アプリ層でAsia/Tokyoに変換して表示（date-fnsは未採用。`Intl.DateTimeFormat` と `src/lib/domain/dates.ts` の自前関数で変換） |
| フォーム/バリデーション | （React Hook Form・Zodは未採用）`src/lib/domain/validation.ts` の自前の検証関数をフォームとAPIで共用 |

### テスト方針

- 単体テスト（Vitest）は、特に組合せ表自動生成・開始ホール自動割当・スコア自動計算（ホールインワン変換を含む）・順位決定ロジックなど「コアロジック」に該当する、間違えやすい機能を重点的にカバーする
- 結合テスト（Playwright）は、API Routes・画面間連携・ブロック系ルール・認証・バックアップ等、複数コンポーネントを跨いだ振る舞いを検証する
- E2E（Playwright）は主要フロー（ログイン → 大会/競技/選手情報登録 → 組合せ表生成 → スコア入力 → 順位表確認）のみを対象とし、全画面を網羅するものではない（データ出力は将来対応のため現時点では対象外）

### 日付/タイムゾーンの扱い

- 利用者は日本国内の大会運営者のみを想定しているため、ユーザーごとのタイムゾーン設定には対応しない（常にAsia/Tokyo表示）
- DBにはUTCで保存し、表示・入力時にアプリ層でJST⇔UTCを変換する

### フォーム/バリデーション方針

- 要件定義書の入力制約（文字数上限、数値範囲、必須/任意など）は `src/lib/domain/validation.ts` の検証関数として定義する（当初想定のZodスキーマは未採用）
- 同じ検証関数を、フロントエンドのフォーム入力制御とAPIルートのリクエストバリデーションの両方で再利用する

## 利用者・ロール

`docs/要件定義書.md` の「2. システム利用者」を参照してください（管理者・参加者・閲覧モード利用者の3区分）。

## ドメインモデル

`docs/要件定義書.md` の「3. 機能要件」各節を参照してください（大会情報・競技情報・選手情報・組合せ表・スコア表・順位表）。

## コアロジック（自動生成・自動計算の仕様）

`docs/要件定義書.md` の「3.4〜3.8」（組合せ表自動生成・開始ホール自動割当、スコア表生成、スコア入力・ホールインワン変換・自動計算、順位表作成、データ出力）を参照してください。実装時に誤りやすい核心部分のため、要約だけに頼らず必ず原文を確認してください。

## 非機能要件

`docs/要件定義書.md` の「4. 非機能要件」を参照してください（対応環境・性能・セキュリティ・バックアップ）。

## 将来対応要件（現時点ではスコープ外）

`docs/要件定義書.md` の「5. 将来対応要件」を参照してください（参加者向け閲覧URL・データ出力（Excel）・WEB公開ページ）。

## コーディング規約

- コード中のコメントは**日本語**で記述する。
- Lint/フォーマッタ: ESLint（`eslint-config-next`）。Prettierは依存として未導入のため、以下の設定に準じた書式で記述する
  - Prettier設定: `singleQuote: true`, `semi: true`, `trailingComma: "all"`, `printWidth: 100`
- 命名規則:
  - コンポーネントファイルは `PascalCase`（例: `Button.tsx`）
  - それ以外のファイル（ユーティリティ等）は `camelCase`
  - ルートフォルダ（`app/` 配下のディレクトリ）は `kebab-case`

## ディレクトリ構成

現在の構成は以下のとおり（当初想定した `(admin)/`・`(public)/` のルートグループは使用していない。参加者向け画面は将来対応）。

```
src/
  app/          … ページ & Route Handlers
    login/      … A1 ログイン画面
    tournaments/ … A2〜A7（大会一覧・大会情報・競技情報・選手情報・組合せ・スコア表・順位表）
    settings/backup/ … A8 バックアップ・リストア画面
    api/        … API Route Handlers
  components/   … UIコンポーネント（admin/・tournament/・backup/・ui/）
  lib/          … JSONストア・認証・業務ロジック・共通ヘルパー（domain/・service/・store/・auth/・client/）
  middleware.ts … 未ログイン時のリダイレクト・401
  types/        … 型定義
electron/
  main.ts       … Electronメインプロセス（Next.jsサーバーの起動・ウィンドウ表示・メニュー）
  server.ts     … 空きポート選定・起動確認ヘルパー
tests/
  integration/  … 結合テスト（Playwright）
  e2e/          … E2Eテスト（Playwright）
installer/
  Mac/・Windows/ … インストール手順書（配布時はインストーラ・操作手順書を同じフォルダに置く）
```

## 環境変数管理

- `.env.example` をリポジトリにコミットし、必要な環境変数のキー一覧を示す（値はダミー）
- 実際の値は `.env.local`（`.gitignore`対象）に記述する
- 変数名は `SCREAMING_SNAKE_CASE` とする。使用する変数は `GRANDGOLF_DATA_DIR`（データ保存先ディレクトリ。BaseProjectの `LEAGUE_TABLE_DATA_DIR` に相当。未指定時は `./data`）・`ADMIN_ID`／`ADMIN_PASSWORD`（初期管理者アカウント）・`SESSION_SECRET`（セッションCookieの署名鍵）。Electron版ではこれらを `electron/main.ts` が設定してNext.jsサーバーに渡す（`docs/データベース仕様書.md` 9章）

## API設計規約

- URL: 名詞複数形を用い、ドメイン階層に沿ってネストする（例: `/api/tournaments/:id/players`）
- メソッド: `GET`(取得) / `POST`(作成) / `PUT`(更新) / `DELETE`(削除)
- レスポンス形式: 成功時 `{ data: ... }`、失敗時 `{ error: { code, message } }`
- ページネーション: `?page=&pageSize=` のクエリパラメータ方式

## バックアップ実装方針

バックアップ要件（手動/自動）自体は `docs/要件定義書.md` の「4. 非機能要件」を参照。実装方式は以下のとおりとする。

- 手動・自動（ログアウト時）とも、全テーブル（大会・競技情報・選手・組合せ表・スコア表・順位表）をJSONエクスポートする共通APIを実装する
- 自動バックアップは、ログアウトAPI呼び出し時に「バックアップする」が選択された場合（管理者ロールのみ）、同じエクスポート処理をトリガーする
- 保存先: ローカルファイルシステム（データ保存先の `backups/`。Electron版のデータ保存先は「現在の状態」参照）。個人情報を含むため非公開のローカルディレクトリに保存し、管理者のみがアプリ経由でアクセスできるようにする（個別ダウンロードは提供しない）

## Gitワークフロー

実装着手前に `git init` でリポジトリ化すること。以降はBaseProjectと同じ運用とする。

### 作業コミット（チェックポイント）

- ファイルを変更する前に、その時点の差分を `git commit` してチェックポイントとして記録すること

### リリースコミット（バージョンタグでの集約）

チャット上で以下のフォーマットの入力があった場合、それまでに積み上がった作業コミットを1つのリリースコミットに集約（squash）し、バージョンタグを付与する。

- **トリガーフォーマット**: `リリース：x.y.z、更新内容`

**リリースコミット作成前の前提条件**: Electronパッケージング（`.github/workflows/electron-build.yml`。成果物は `dist-installer/` に出力され、配布時に `installer/` 配下へ置く）等、タグpushで起動するビルド・パブリッシュ処理が構成に含まれている場合は、リリースコミット（スクワッシュ＋タグ付け）を実行する前に、そのビルドが問題なく成功することを検証しておく（例：GitHub Actionsの`workflow_dispatch`で手動実行、または `installer-test` ブランチへのpushで試験ビルドし、失敗があれば通常の作業コミットとして修正を重ねる）。検証済みの状態で初めてリリースコミットを作成することで、タグ付け後に不具合が見つかり、既にpush済みのリリースコミット・タグをamend・force pushし直すような手戻りを避けられる。

**手順:**

1. 直前のリリースタグを確認する: `git tag --list 'v*' --sort=-v:refname | head -1`
2. **直前のタグが存在する場合**: `git reset --soft <直前のタグ>` でそのタグ以降の作業コミットをまとめ、`git tag vx.y.z` を付与する
3. **直前のタグが存在しない場合（初回リリース）**: それまでの全コミット（初期コミットを含む）を1つのリリースコミットに置き換える（オーファンブランチで作り直す: `git checkout --orphan` → `git add -A` → `git commit` → 旧ブランチを削除してリネーム）。その後 `git tag v1.0.0` のようにタグを付与する
4. コミット時に現在日付を取得し（`date +%Y-%m-%d`）、コミットメッセージはユーザー入力に日付を付加した形にする: `git commit -m "リリース：x.y.z、更新内容 (YYYY-MM-DD)"`（例: `リリース：1.0.0、初回リリース (2026-11-16)`）
5. `docs/リリースノート.md`の先頭に、当該バージョンのエントリ（バージョン・日付・内容の箇条書き）を追記する（上記のリリースコミットに含める）

この結果、リリース後のGit履歴には作業コミットは残らず、リリースコミット（タグ付き・日付入り）のみが積み重なる。

既存のバージョン番号のまま内容だけ差し替える場合（例：一部プラットフォームが未対応のため同一バージョンでリリースし直す）は、手順3（オーファンブランチでの作り直し）に準じて全履歴を1コミットに置き換えたうえで、既存のタグを同じバージョン番号のまま上書き（`git tag -f`）する。

## 開発時の注意事項

- 要件定義書（`docs/要件定義書.md`）を実装の一次情報源とし、矛盾があれば要件定義書を優先する
- 技術スタックや新しい依存関係を導入する前に、必ずユーザーに確認する
- BaseProjectのロジック（リーグ戦・コート・審判割当等）をグランドゴルフのドメインロジック（組合せ表・スコア表・順位表）に安易に転用しない。ドメインが異なるため、要件定義書の記載に従うこと
- ビルド/テスト/Lintコマンドが整備されたら、このファイルの「現在の状態」セクションを更新すること
