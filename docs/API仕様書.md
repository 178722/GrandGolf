# API仕様書

## 目的

本ドキュメントは、「グランドゴルフしようよ」の現行実装におけるAPI Route Handlers（`src/app/api/**/route.ts`）の仕様を示す。

- 要件の一次情報源は `要件定義書.md` である。本書は実装（`src/app/api/`・`src/lib/api.ts`・`src/middleware.ts`・`src/lib/auth/`・`src/lib/service/`・`src/lib/store/`）の内容を記述したものであり、Route Handlerを変更した場合は本書も合わせて更新すること。
- データ構造（型・制約・保存形式）は `データベース仕様書.md` を参照。

## 1. 全体設計

- 設計規約は `CLAUDE.md` の「API設計規約」に従う（名詞複数形・ドメイン階層のネスト、`GET`/`POST`/`PUT`/`DELETE`、`{ data }` / `{ error: { code, message } }`）。
- リクエスト・レスポンスのボディはJSON（`Content-Type: application/json`）。
- **画面表示用のデータ取得はAPIを経由しない。** 管理者向け画面（A2〜A7）はServer Componentであり、`src/lib/service/tournamentService.ts` の `listTournaments()` / `getTournamentDetail()`（`src/lib/pageContext.ts` 経由）を直接呼び出す。`GET /api/tournaments`・`GET /api/tournaments/:id` は実装されているが、現行の画面からは呼び出していない。A8（バックアップ）の履歴一覧のみ `GET /api/backups` を使用する。
- ページネーション（`?page=&pageSize=`）を使用するAPIは現行実装には存在しない。
- 業務処理はすべて `tournamentService.ts` / `src/lib/store/backup.ts` を経由し、`updateDb()` / `withDbLock()` の排他区間内で実行される（`データベース仕様書.md` 6章）。

## 2. 認証・認可

### 2.1 セッション

Cookieベースの署名付きセッション（`src/lib/auth/session.ts`）。サーバー側にセッション状態を持たず、HMAC-SHA256署名付きCookieのみで完結する。

| Cookie | 内容 | 属性 |
|---|---|---|
| `gg_session` | `{ role: 'admin' \| 'viewer', iat }` を署名したもの | `httpOnly`, `sameSite=lax`, `path=/`、有効期限なし（ブラウザセッションCookie） |
| `gg_role` | `'admin'` / `'viewer'`（UI表示用。認可判定には使わない） | `sameSite=lax`, `path=/` |

### 2.2 ミドルウェア（`src/middleware.ts`）

- 対象パス（`config.matcher`）：`/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)`。すなわち `/login`・`/api/auth/*`・静的アセット以外のすべての画面とAPI。
- 処理：`gg_session` を検証（署名・ロール値）し、無効または未設定の場合
  - パスが `/api/` で始まる場合：`401` `{ error: { code: 'UNAUTHORIZED', message: 'ログインしてください' } }` を返す（Route Handlerは実行されない）
  - それ以外（画面）：`/login` へリダイレクト
- 有効な場合はロールに関わらず通過させる。**ミドルウェアは閲覧モード（`viewer`）の書き込み拒否を行わない。** 閲覧モードの書き込み拒否は、各Route Handlerの先頭で呼ぶ `requireAdmin()`（2.3）が行う。
- `/api/auth/*` はミドルウェアの対象外のため、ログイン・閲覧モード開始・ログアウト・ID/パスワード変更は未ログインでも呼び出せる。

### 2.3 認可ガード（`src/lib/api.ts`）

| 関数 | 挙動 | 本書の「認可」欄の表記 |
|---|---|---|
| `requireSession()` | セッションが無効なら `401 UNAUTHORIZED`。ロールは問わない | 閲覧モード可 |
| `requireAdmin()` | `requireSession()` に加え、ロールが `admin` 以外なら `403 FORBIDDEN`（「閲覧モードのため変更できません」） | 管理者のみ |
| （ガードなし） | `/api/auth/*` | 未ログイン可 |

ミドルウェアで未ログインは既に401となるため、Route Handler内の `UNAUTHORIZED` は多重防御である。

## 3. 共通仕様

### 3.1 レスポンス形式

成功時（`ok(data, status)`。既定ステータス200、作成系は201）：

```json
{ "data": { } }
```

失敗時（`fail(code, message, status, details?)`）：

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "入力内容に誤りがあります", "details": { "name": "大会名を入力してください" } } }
```

- `details` は入力欄ごとのエラーがある場合のみ付与する。大会情報・競技情報では `{ [項目名]: メッセージ }`、選手一覧では `{ [配列インデックス]: { [項目名]: メッセージ } }`。

### 3.2 共通処理

- `handle(fn)`：ハンドラ内で発生した `AppError` を所定のエラーレスポンスに変換する。それ以外の例外は `500 INTERNAL_ERROR`（「サーバーでエラーが発生しました」）とし、サーバーログに出力する。
- `readJson(request)`：ボディが空なら `{}`。JSONとして不正なら `400 VALIDATION_ERROR`（「リクエストの形式が正しくありません」）。JSONがオブジェクト（配列を含む `typeof 'object'`）でない場合は `{}` として扱う。
- `parsePartyNumber(value)`：パスパラメータのパーティ番号が整数でなければ `404 NOT_FOUND`（「パーティが見つかりません」）。
- `/api/auth/login`・`/api/auth/credentials`・`/api/auth/viewer-login` は `handle()` を使用せず、個別にレスポンスを組み立てる（エラーコードは小文字表記。3.3参照）。

### 3.3 エラーコード一覧

| code | HTTP | 発生箇所・内容 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未ログイン（ミドルウェア、`requireSession()` / `requireAdmin()`） |
| `FORBIDDEN` | 403 | 閲覧モードでの書き込み操作（`requireAdmin()`） |
| `VALIDATION_ERROR` | 400 | 入力値の不正、不正なJSON、ラウンド・開始ホール範囲外、開始グループ内の開始ホール重複、手動確定の対象・順位の不正、競技情報未登録での順位表作成 等 |
| `NOT_FOUND` | 404 | 大会・選手・パーティ・順位表・バックアップが存在しない |
| `TOURNAMENT_FINISHED` | 409 | 大会のステータスが「終了」の間の変更操作（「大会が終了しているため変更できません」） |
| `RESULTS_EXIST` | 409 | 試合結果（スコア）が1件以上ある状態での、ブロック対象の変更・組合せ表再生成 |
| `CONFIRM_REQUIRED` | 409 | 組合せ表生成済み（試合結果なし）で、組合せ表のリセットを伴う変更を `confirmReset: true` なしで要求した（「既存の組合せ表・スコア表を削除し、再生成が必要になります。変更しますか？」） |
| `PAIRING_ERROR` | 400 | 組合せ表を生成できない条件（6.9参照） |
| `INTERNAL_ERROR` | 500 | 想定外の例外（`handle()`） |
| `invalid_request` | 400 | ログイン・ID/パスワード変更で必須項目が不足・型不正 |
| `invalid_password` | 400 | ID/パスワード変更で新しいパスワードが8文字未満 |
| `invalid_credentials` | 401 | ログイン・ID/パスワード変更でID・パスワードが一致しない |

## 4. エンドポイント一覧

| メソッド | パス | 認可 | 概要 | 成功ステータス |
|---|---|---|---|---|
| POST | `/api/auth/login` | 未ログイン可 | 管理者ログイン | 200 |
| POST | `/api/auth/viewer-login` | 未ログイン可 | 閲覧モード開始 | 200 |
| POST | `/api/auth/logout` | 未ログイン可 | ログアウト（任意でバックアップ） | 200 |
| POST | `/api/auth/credentials` | 未ログイン可 | 管理者ID・パスワード変更 | 200 |
| GET | `/api/tournaments` | 閲覧モード可 | 大会一覧 | 200 |
| POST | `/api/tournaments` | 管理者のみ | 大会の新規登録 | 201 |
| GET | `/api/tournaments/:id` | 閲覧モード可 | 大会詳細 | 200 |
| PUT | `/api/tournaments/:id` | 管理者のみ | 大会情報の更新 | 200 |
| DELETE | `/api/tournaments/:id` | 管理者のみ | 大会の削除（カスケード） | 200 |
| PUT | `/api/tournaments/:id/status` | 管理者のみ | ステータス切替（終了／再開） | 200 |
| PUT | `/api/tournaments/:id/competition` | 管理者のみ | 競技情報の登録・更新 | 200 |
| PUT | `/api/tournaments/:id/players` | 管理者のみ | 選手一覧の一括保存 | 200 |
| POST | `/api/tournaments/:id/pairings` | 管理者のみ | 組合せ表（＋スコア表）の生成・再生成 | 201 |
| PUT | `/api/tournaments/:id/pairings/:partyNumber/start-hole` | 管理者のみ | 開始ホールの手動変更 | 200 |
| PUT | `/api/tournaments/:id/scores` | 管理者のみ | パーティ×ラウンドのスコア一括保存 | 200 |
| DELETE | `/api/tournaments/:id/scores` | 管理者のみ | パーティ×ラウンドのスコア削除 | 200 |
| POST | `/api/tournaments/:id/rankings` | 管理者のみ | 順位表作成 | 201 |
| PUT | `/api/tournaments/:id/rankings/manual` | 管理者のみ | 最終順位の手動確定（じゃんけん結果） | 200 |
| GET | `/api/backups` | 閲覧モード可 | バックアップ履歴 | 200 |
| POST | `/api/backups` | 管理者のみ | 手動バックアップ | 201 |
| POST | `/api/backups/:backupId/restore` | 管理者のみ | バックアップからの復元 | 200 |

以下、各エンドポイントのエラーは原則として判定順に記載する。認可欄が「管理者のみ」のものは、すべて先頭で `401 UNAUTHORIZED`（ミドルウェア）・`403 FORBIDDEN`（閲覧モード）の判定を行う（以下では省略）。

## 5. 認証API（`/api/auth/*`）

### 5.1 POST `/api/auth/login`

管理者ID・パスワードを検証し、セッションCookieを発行する。

- リクエストボディ：`{ id: string, password: string }`
- 処理：`admin.json` を読み込み（無ければ環境変数 `ADMIN_ID`/`ADMIN_PASSWORD` からシード）、パスワードをbcryptで照合し、IDを完全一致で比較する。
- 成功：`200` `{ data: { role: 'admin' } }`。`gg_session`（role=admin）・`gg_role=admin` を設定。

| 条件 | ステータス | code | message |
|---|---|---|---|
| ボディがJSONでない、`id`/`password` が文字列でない | 400 | `invalid_request` | ID・パスワードを入力してください |
| IDまたはパスワードが一致しない | 401 | `invalid_credentials` | IDまたはパスワードが正しくありません |

※ `handle()` を使用しないため、`admin.json` のシードに必要な環境変数が無い等の例外はNext.js既定の500応答となる（`{ error }` 形式ではない）。

### 5.2 POST `/api/auth/viewer-login`

ID・パスワードなしで閲覧モードのセッションを発行する。

- リクエストボディ：なし
- 成功：`200` `{ data: { role: 'viewer' } }`。`gg_session`（role=viewer）・`gg_role=viewer` を設定。
- エラー：なし（既存の管理者セッションがあっても閲覧モードで上書きする）

### 5.3 POST `/api/auth/logout`

セッションを破棄する。任意でログアウト時バックアップを作成する。

- リクエストボディ：`{ backup?: boolean }`
- 処理：`backup === true` かつ現在のセッションのロールが `admin` の場合のみ、契機「ログアウト」のバックアップを作成してから、`gg_session`・`gg_role` を削除する。閲覧モード・未ログインの場合は `backup: true` でもバックアップを作成しない（エラーにもしない）。
- 成功：`200` `{ data: { ok: true, backupCreated: boolean } }`

| 条件 | ステータス | code |
|---|---|---|
| ボディがJSONとして不正（この場合Cookieは削除されない） | 400 | `VALIDATION_ERROR` |
| バックアップ作成時の想定外エラー | 500 | `INTERNAL_ERROR` |

### 5.4 POST `/api/auth/credentials`

管理者のログインID・パスワードを変更する。未ログイン状態でも、現在のID・パスワードを本人確認として実行できる（ログイン画面のダイアログから使用）。

- リクエストボディ：`{ currentId: string, currentPassword: string, newId: string, newPassword: string }`
- 処理：検証後、`admin.json` を新しいID・bcryptハッシュで上書きする。既存のセッションは無効化しない。
- 成功：`200` `{ data: { ok: true } }`

| 条件（判定順） | ステータス | code | message |
|---|---|---|---|
| いずれかが文字列でない、または `newId` が空文字 | 400 | `invalid_request` | すべての項目を入力してください |
| `newPassword` が8文字未満（`String.length` で判定） | 400 | `invalid_password` | 新しいパスワードは最低8文字以上で入力してください |
| 現在のID・パスワードが一致しない | 401 | `invalid_credentials` | 現在のID・パスワードが正しくありません |

※ 新しいパスワードの長さ検証は本人確認より先に行う。`newId` の前後空白は除去しない。

## 6. 大会API（`/api/tournaments`）

### 6.0 共通：大会ステータスと試合結果による制限

| 操作 | 「終了」中 | 試合結果あり |
|---|---|---|
| 大会情報の更新 | 409 `TOURNAMENT_FINISHED` | 制限なし |
| 大会の削除 | 可 | 可（カスケード削除） |
| ステータス切替 | 可 | 可 |
| 競技情報の保存 | 409 `TOURNAMENT_FINISHED` | 変更ありなら 409 `RESULTS_EXIST` |
| 選手一覧の保存 | 409 `TOURNAMENT_FINISHED` | 6.8参照 |
| 組合せ表の生成 | 409 `TOURNAMENT_FINISHED` | 409 `RESULTS_EXIST` |
| 開始ホールの変更 | 409 `TOURNAMENT_FINISHED` | 制限なし |
| スコアの保存・削除 | 409 `TOURNAMENT_FINISHED` | — |
| 順位表作成 | 409 `TOURNAMENT_FINISHED` | — |
| 最終順位の手動確定 | 409 `TOURNAMENT_FINISHED` | — |

### 6.1 GET `/api/tournaments`

- 認可：閲覧モード可
- 成功：`200` `{ data: Tournament[] }`（開催日の降順、同日は作成日時の降順）

### 6.2 POST `/api/tournaments`

- 認可：管理者のみ
- リクエストボディ：`{ name: string, date: string /* YYYY-MM-DD */, place: string }`
- 処理：前後空白を除去して検証し、`id`（UUID）・`status: '進行中'`・`createdAt`（UTC）を付与して登録する。
- 成功：`201` `{ data: Tournament }`

| 条件 | ステータス | code |
|---|---|---|
| ボディが不正なJSON | 400 | `VALIDATION_ERROR` |
| 大会名：未入力／51文字以上、開催日：未入力／`YYYY-MM-DD` でない・実在しない日付、開催場所：未入力／51文字以上 | 400 | `VALIDATION_ERROR`（`details` に項目別メッセージ） |

### 6.3 GET `/api/tournaments/:id`

- 認可：閲覧モード可
- 成功：`200` `{ data: TournamentDetail }`

```typescript
type TournamentDetail = {
  tournament: Tournament;
  competition: Competition | null;
  players: Player[];          // 登録順（order 昇順）
  parties: Party[];           // パーティ番号昇順
  scores: Score[];
  ranking: RankingSnapshot | null;
  hasPairings: boolean;       // parties が1件以上
  hasResults: boolean;        // scores が1件以上
};
```

| 条件 | ステータス | code |
|---|---|---|
| 大会が存在しない | 404 | `NOT_FOUND` |

### 6.4 PUT `/api/tournaments/:id`

- 認可：管理者のみ
- リクエストボディ：`{ name, date, place }`（6.2と同じ）
- 成功：`200` `{ data: Tournament }`（`status`・`createdAt` は変更しない）

| 条件（判定順） | ステータス | code |
|---|---|---|
| 不正なJSON | 400 | `VALIDATION_ERROR` |
| 大会が存在しない | 404 | `NOT_FOUND` |
| 大会が「終了」 | 409 | `TOURNAMENT_FINISHED` |
| 入力値が不正（6.2と同じ） | 400 | `VALIDATION_ERROR`（`details` あり） |

### 6.5 DELETE `/api/tournaments/:id`

- 認可：管理者のみ
- 処理：大会と、紐づく競技情報・選手・組合せ表・スコア・順位表をカスケード削除する。ステータス・試合結果の有無に関わらず実行できる。
- 成功：`200` `{ data: { ok: true } }`

| 条件 | ステータス | code |
|---|---|---|
| 大会が存在しない | 404 | `NOT_FOUND` |

### 6.6 PUT `/api/tournaments/:id/status`

- 認可：管理者のみ
- リクエストボディ：`{ status: '進行中' | '終了' }`
- 処理：ステータスを設定する（同じ値の指定も可）。
- 成功：`200` `{ data: Tournament }`

| 条件（判定順） | ステータス | code |
|---|---|---|
| 不正なJSON | 400 | `VALIDATION_ERROR` |
| `status` が `'進行中'` / `'終了'` 以外 | 400 | `VALIDATION_ERROR` |
| 大会が存在しない | 404 | `NOT_FOUND` |

### 6.7 PUT `/api/tournaments/:id/competition`

競技情報を登録・更新する（1大会1件。既存があれば置き換え）。

- 認可：管理者のみ
- リクエストボディ：

```typescript
{
  competition: {
    rounds: number;                          // 整数 1〜5
    holeInOneConversionEnabled: boolean;
    holeInOneConversionValue?: number|null;  // 変換ありの場合のみ必須：整数 -5〜1
    maxPartySize: number;                    // 整数 1〜6
    partyAssignmentMethod: 'チーム' | 'シャッフル';
    teamBattleEnabled: boolean;
    teamRankingMethod?: '合計'|'平均'|null;  // チーム戦ありの場合のみ必須
  };
  confirmReset?: boolean;  // 組合せ表のリセットに同意する場合 true
}
```

- 処理：変換なしの場合 `holeInOneConversionValue` を、チーム戦なしの場合 `teamRankingMethod` を `null` として保存する。既存の競技情報と比較し1項目でも異なれば「変更あり」とする。既存の競技情報がない（新規登録）場合は、試合結果・組合せ表によるブロック判定を行わない。
- 成功：`200` `{ data: Competition }`

| 条件（判定順） | ステータス | code |
|---|---|---|
| 不正なJSON | 400 | `VALIDATION_ERROR` |
| 大会が存在しない | 404 | `NOT_FOUND` |
| 大会が「終了」 | 409 | `TOURNAMENT_FINISHED` |
| 入力値が不正 | 400 | `VALIDATION_ERROR`（`details` あり） |
| 既存から変更あり、かつ試合結果が1件以上 | 409 | `RESULTS_EXIST`（「試合結果が登録されているため変更できません」） |
| 既存から変更あり、試合結果なし、組合せ表生成済み、`confirmReset !== true` | 409 | `CONFIRM_REQUIRED` |

`confirmReset: true` の場合は、組合せ表・スコア・順位表を削除したうえで保存する。変更がない場合は組合せ表があってもそのまま保存する。

### 6.8 PUT `/api/tournaments/:id/players`

選手一覧を一括保存する（新規登録・編集・削除をまとめて反映）。

- 認可：管理者のみ
- リクエストボディ：

```typescript
{
  players: Array<{
    id?: string;            // 既存選手は必須（新規は省略）
    name: string;           // 1〜10文字、同一リクエスト内で重複不可
    birthDate: string;      // 'YYYY/MM/DD' または 'S|H|R' + 'YY.MM.DD'（例 S46.05.24）
    teamName: string;       // 0〜10文字。競技情報が「チーム戦あり」または「決定方法＝チーム」なら必須
    partyFixed: boolean;
    partyNumber?: number|null; // 固定の場合のみ必須：整数 1〜99
    absent?: boolean;       // 不参加。未指定は false
  }>;
  confirmReset?: boolean;
}
```

- 処理：`players` は保存後の全選手であり、含まれない既存選手は削除する。生年月日は `YYYY-MM-DD` に正規化して保存。新規選手は登録順の末尾に追加する。
- 成功：`200` `{ data: Player[] }`（その大会の保存後の全選手、登録順）

| 条件（判定順） | ステータス | code |
|---|---|---|
| 不正なJSON | 400 | `VALIDATION_ERROR` |
| `players` が配列でない | 400 | `VALIDATION_ERROR`（選手一覧の形式が正しくありません） |
| 大会が存在しない | 404 | `NOT_FOUND` |
| 大会が「終了」 | 409 | `TOURNAMENT_FINISHED` |
| 各選手の入力値が不正、選手名の重複 | 400 | `VALIDATION_ERROR`（`details` は配列インデックスごとの項目エラー） |
| 指定された `id` の選手がその大会に存在しない | 404 | `NOT_FOUND`（選手が見つかりません） |
| 試合結果あり：削除対象に試合結果のある選手が含まれる | 409 | `RESULTS_EXIST`（試合結果が登録されている選手は削除できません（選手名、…）） |
| 試合結果あり：既存選手のパーティ固定・パーティ番号・チーム名・不参加のいずれかを変更 | 409 | `RESULTS_EXIST` |
| 試合結果なし・組合せ表生成済み：選手の追加・削除、または既存選手の選手名・生年月日・パーティ固定・パーティ番号・チーム名・不参加のいずれかの変更があり、`confirmReset !== true` | 409 | `CONFIRM_REQUIRED` |

- `confirmReset: true` の場合は組合せ表・スコア・順位表を削除したうえで保存する（要件定義書2.1。試合結果が未入力なら、選手名・生年月日のみの変更もリセットの対象）。内容に変更がない保存は `confirmReset` に関わらずリセットしない。
- 試合結果がある場合でも、選手名・生年月日の訂正、試合結果のない選手の削除、新規選手の追加は可能（組合せ表・スコア表・試合結果はリセットしない）。試合結果のない選手を削除した場合は、その選手をパーティから外し、空になったパーティを削除する。新規追加した選手は組合せ表に入らない。

### 6.9 POST `/api/tournaments/:id/pairings`

組合せ表（パーティ編成・開始ホール）を一括生成・再生成する。スコア表は組合せ表×ラウンド数から構成されるため、別途生成するAPIはない。

- 認可：管理者のみ
- リクエストボディ：なし
- 処理：不参加を除く選手を対象にパーティを編成し（要件定義書3.4）、開始ホールを自動割当する。既存の組合せ表・スコア・順位表を削除してから保存する。
- 成功：`201` `{ data: Party[] }`（パーティ番号昇順）

| 条件（判定順） | ステータス | code | message |
|---|---|---|---|
| 大会が存在しない | 404 | `NOT_FOUND` | 大会が見つかりません |
| 大会が「終了」 | 409 | `TOURNAMENT_FINISHED` | |
| 試合結果が1件以上 | 409 | `RESULTS_EXIST` | 試合結果が入力されています。試合結果を削除して下さい。 |
| 競技情報が未登録 | 400 | `PAIRING_ERROR` | 競技情報が登録されていません。競技情報を登録してください。 |
| 参加選手（不参加を除く）が2名未満 | 400 | `PAIRING_ERROR` | 参加選手数が2名未満のため組合せ表を作成できません。選手を2名以上登録してください。 |
| 固定選手が同一パーティ番号で最大人数を超える | 400 | `PAIRING_ERROR` | パーティ番号○の人数がパーティの最大人数を超えています。選手情報のパーティ番号を見直してください。 |
| （決定方法＝チーム）チーム名未入力の非固定選手がいる | 400 | `PAIRING_ERROR` | チーム名が未入力の選手がいます。選手情報を見直してください。 |
| （決定方法＝チーム）同一チームの非固定選手数が最大人数を超える | 400 | `PAIRING_ERROR` | チーム『○○』の人数がパーティの最大人数を超えています。選手情報またはパーティの最大人数を見直してください。 |

### 6.10 PUT `/api/tournaments/:id/pairings/:partyNumber/start-hole`

パーティの開始ホールを手動変更する。

- 認可：管理者のみ
- パスパラメータ：`partyNumber`（整数）
- リクエストボディ：`{ startHole: number }`（整数 1〜8）
- 成功：`200` `{ data: Party }`

| 条件（判定順） | ステータス | code |
|---|---|---|
| 不正なJSON | 400 | `VALIDATION_ERROR` |
| `partyNumber` が整数でない | 404 | `NOT_FOUND` |
| 大会が存在しない | 404 | `NOT_FOUND` |
| 大会が「終了」 | 409 | `TOURNAMENT_FINISHED` |
| `startHole` が整数1〜8でない | 400 | `VALIDATION_ERROR` |
| パーティが存在しない | 404 | `NOT_FOUND` |
| 同じ開始グループ（変更前）の他パーティが使用中の開始ホール | 400 | `VALIDATION_ERROR`（開始ホール○は、同じ開始グループのパーティ○に割り当て済みのため選択できません） |

開始グループ：同じ開始ホールのパーティにパーティ番号の小さい順で1, 2, 3…と付けた番号（保存しない。`assignStartGroups()`）。現在と同じ開始ホールの指定はエラーにならない。試合結果の有無による制限はない。

### 6.11 PUT `/api/tournaments/:id/scores`

パーティ内全選手の1ラウンド8ホール分のスコアを一括保存する（同じパーティ・ラウンドの既存スコアは置き換え）。

- 認可：管理者のみ
- リクエストボディ：

```typescript
{
  partyNumber: number;
  round: number;                          // 整数 1〜競技情報のラウンド数
  scores: { [playerId: string]: number[] }; // ホール1〜8順の打数（各 整数1〜99、ちょうど8要素）
}
```

- 成功：`200` `{ data: Score[] }`（保存したパーティ内全選手分）
- 保存するのは打数（生の値）。ホールインワン変換・合計は画面側・順位表作成時に計算する。順位表は自動で再集計しない。

| 条件（判定順） | ステータス | code | message |
|---|---|---|---|
| 不正なJSON | 400 | `VALIDATION_ERROR` | |
| `partyNumber` が数値でない | 400 | `VALIDATION_ERROR` | パーティ番号を指定してください |
| 大会が存在しない | 404 | `NOT_FOUND` | |
| 大会が「終了」 | 409 | `TOURNAMENT_FINISHED` | |
| パーティが存在しない | 404 | `NOT_FOUND` | パーティが見つかりません |
| `round` が整数1〜ラウンド数でない（競技情報未登録時はラウンド数0扱いで常にエラー） | 400 | `VALIDATION_ERROR` | ラウンドは1〜○の範囲で指定してください |
| `scores` がオブジェクトでない | 400 | `VALIDATION_ERROR` | スコアを入力してください |
| `scores` のキーがパーティ内の選手IDと過不足なく一致しない | 400 | `VALIDATION_ERROR` | パーティ内の全選手のスコアを入力してください |
| いずれかの選手の打数が「整数1〜99×8要素」でない | 400 | `VALIDATION_ERROR` | 打数は1〜99の整数で8ホール分を入力してください |

### 6.12 DELETE `/api/tournaments/:id/scores`

パーティの1ラウンド分のスコアを削除し、未入力に戻す。

- 認可：管理者のみ
- リクエストボディ：`{ partyNumber: number, round: number }`
- 成功：`200` `{ data: { ok: true } }`（対象スコアが無くてもエラーにしない）

| 条件（判定順） | ステータス | code |
|---|---|---|
| 不正なJSON | 400 | `VALIDATION_ERROR` |
| `partyNumber` が数値でない | 400 | `VALIDATION_ERROR` |
| 大会が存在しない | 404 | `NOT_FOUND` |
| 大会が「終了」 | 409 | `TOURNAMENT_FINISHED` |
| パーティが存在しない | 404 | `NOT_FOUND` |
| `round` が整数1〜ラウンド数でない | 400 | `VALIDATION_ERROR` |

### 6.13 POST `/api/tournaments/:id/rankings`

その時点のスコアで総合順位表（個人戦・チーム戦）を集計し、スナップショットとして保存する（既存の順位表は置き換え。手動確定の内容は引き継がない）。

- 認可：管理者のみ
- リクエストボディ：なし
- 処理：不参加の選手を除き、全ラウンド分のスコアが保存済みの選手のみ集計する（それ以外は `excludedPlayerNames`）。順位決定は `データベース仕様書.md` 3.8参照。
- 成功：`201` `{ data: RankingSnapshot }`
- 大会が「終了」の間は実行できない（要件定義書2.1。既存の順位表はそのまま残る）。組合せ表の有無は問わない。

| 条件（判定順） | ステータス | code |
|---|---|---|
| 大会が存在しない | 404 | `NOT_FOUND` |
| 大会が「終了」 | 409 | `TOURNAMENT_FINISHED`（大会が終了しているため変更できません） |
| 競技情報が未登録 | 400 | `VALIDATION_ERROR`（競技情報が登録されていません） |

### 6.14 PUT `/api/tournaments/:id/rankings/manual`

じゃんけん待ちの行の最終順位を手動確定する（確定状態は記憶せず、順位表のスナップショットを直接上書きする）。

- 認可：管理者のみ
- リクエストボディ：

```typescript
{
  target: { kind: 'individual'; playerId: string } | { kind: 'team'; teamName: string };
  rank: number;  // 整数。対象行の同順位グループの範囲 tieRank 〜 tieRank+tieSize-1
}
```

- 成功：`200` `{ data: RankingSnapshot }`（対象行の `rank` を上書きし `jankenPending: false` とし、順位順に並べ替えたもの）

| 条件（判定順） | ステータス | code | message |
|---|---|---|---|
| 不正なJSON | 400 | `VALIDATION_ERROR` | |
| `target` の形式が不正 | 400 | `VALIDATION_ERROR` | 確定対象の指定が正しくありません |
| 大会が存在しない | 404 | `NOT_FOUND` | |
| 大会が「終了」 | 409 | `TOURNAMENT_FINISHED` | 大会が終了しているため変更できません |
| 順位表が未作成 | 404 | `NOT_FOUND` | 順位表が作成されていません |
| チーム戦の順位表がない（`kind: 'team'`） | 400 | `VALIDATION_ERROR` | チーム戦の順位表がありません |
| 対象が順位表に存在しない | 400 | `VALIDATION_ERROR` | 対象が順位表に見つかりません |
| 対象がじゃんけん待ちでない | 400 | `VALIDATION_ERROR` | じゃんけん待ちではないため手動確定できません |
| `rank` がグループの範囲外・整数でない | 400 | `VALIDATION_ERROR` | 確定する順位は○〜○の範囲で入力してください |
| 同じグループ内で既に確定済みの順位 | 400 | `VALIDATION_ERROR` | ○位は同じグループ内で既に確定済みです |

- 大会が「終了」の間は手動確定できない（要件定義書2.1）。「終了」の判定は順位表の存在チェックより前に行う。

## 7. バックアップAPI（`/api/backups`）

### 7.1 GET `/api/backups`

- 認可：閲覧モード可
- クエリ：`from`（任意、`YYYY-MM-DD`）、`to`（任意、`YYYY-MM-DD`）。Asia/Tokyoの日付として、作成日時が `from` 00:00:00 以上 `to` の翌日 00:00:00 未満のものに絞り込む。空文字は未指定扱い。
- 成功：`200` `{ data: BackupMeta[] }`（作成日時の新しい順）

```typescript
type BackupMeta = { id: string; createdAt: string /* UTC ISO */; trigger: '手動' | 'ログアウト' };
```

| 条件 | ステータス | code |
|---|---|---|
| `from`/`to` が実在する `YYYY-MM-DD` でない | 400 | `VALIDATION_ERROR`（期間の指定が正しくありません） |

### 7.2 POST `/api/backups`

- 認可：管理者のみ
- リクエストボディ：なし
- 処理：現在の業務データ（`db.json` 全体）で契機「手動」のバックアップを作成し、20件を超えた分を古い順に削除する。
- 成功：`201` `{ data: BackupMeta }`

### 7.3 POST `/api/backups/:backupId/restore`

- 認可：管理者のみ
- 処理：選択したバックアップの内容で業務データ（`db.json`）を完全に上書きする。バックアップ履歴・管理者アカウント・セッションは変更しない。大会のステータスに関わらず実行できる。
- 成功：`200` `{ data: { ok: true } }`

| 条件 | ステータス | code |
|---|---|---|
| `backupId` が `^[0-9A-Za-z-]+$` に一致しない、またはファイルが存在しない・読み込めない | 404 | `NOT_FOUND`（バックアップが見つかりません） |
