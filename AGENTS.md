# AGENTS.md

このファイルは、このリポジトリで作業する **全てのAIコーディングツール共通** のルールです。
Claude Code、Cursor、GitHub Copilot、Codex など、使用するツールに関わらずここに書かれたルールに従ってください。
（ツール固有の設定ファイルがある場合は、このファイルを参照する形にしています。重複させず、ルールの変更は必ずこのファイルに対して行ってください。）

## プロジェクト概要

「おうちギルド」（旧名「我が家中央銀行」）— 家庭内の家事・お手伝いをクエスト化し、独自通貨・銀行・ストアで報酬を与える家族向けアプリ。
詳細は [README.md](README.md) を参照。

## 技術スタック

- TypeScript（`strict: false`）
- Expo / React Native（Expo Router によるファイルベースルーティング）
- NativeWind（Tailwind CSS for RN）
- Zustand（状態管理）
- Supabase（DB / Auth / Realtime、直接呼び出し。TanStack Query 等は未導入。取得結果のキャッシュは自前の `lib/useResource.ts`）
- 子供用RPGハブの3D表示: WebView + Babylon.js（`react-native-webview` 経由。シーン本体は `webview/rpg-hub/scene.ts` を esbuild でバンドルして WebView へ渡す。選定の経緯は [docs/RPG_HUB_ENGINE_INVESTIGATION.md](docs/RPG_HUB_ENGINE_INVESTIGATION.md)）

## 開発フロー（必須・省略不可）

```
Issue作成 → ブランチ作成 → コード変更 → コミット → Push → PR作成 → CI確認 → CodeRabbitレビュー確認 → Approve/マージ
```

- **Issue を作らずに作業を始めない。** 何をするか宣言してから着手する。
  - ただし多少の変更（軽微な修正など）であれば、ユーザーに確認を取った上で、新規Issueを作らず作業中の同じPRに含めてよい。
- **作業前に必ず `main` を pull する。** ブランチを切る前に必ず以下を実行し、最新の `main` から分岐する。

  ```bash
  git checkout main
  git pull origin main
  git checkout -b {type}/#{Issue番号}-{内容}
  ```

- **`main` への直接 push は禁止。** 必ずブランチを切り、PR経由でマージする（ブランチ保護あり）。
- PRタイトルは対応する Issue のタイトルに合わせることが望ましいが、省略してもよい。
- マージ後は該当ブランチを削除する。
- **Issue/PR作業中に見つけたスコープ外の問題を、勝手に新しい Issue として作成しない。** 気づいた内容をユーザーに報告し、Issue化するかどうか・内容を確認してから作成する。

### ブランチ名

```
{type}/#{Issue番号}-{内容（kebab-case）}
```

| type | 用途 |
| --- | --- |
| `feature` | 新機能・画面・ロジックの追加 |
| `fix` | バグ修正 |
| `chore` | 設定変更・依存更新・リファクタなど |

例: `feature/#5-add-login-screen`, `fix/#12-quest-approval-crash`

### コミットメッセージ

```
{種類}: {何をしたか}
```

種類: `feat` / `fix` / `chore` / `docs` / `style` / `refactor`

## PR前チェック（CIと同じ内容をローカルで先に確認する）

```bash
npx tsc --noEmit     # 型チェック（CIの Type Check ジョブと同一）
npm test             # テスト（tests/ 配下、node --test。ロジック追加時のテスト方針は下記参照）
npm run build:scene  # 子供用RPGハブのシーンをバンドルできるか（下記参照）
npm run migration:check # マイグレーション番号・ファイル名の検証
```

- CI（Type Check / Test / DB Migration）が通ることを確認してから push する。
  - マイグレーション番号・最新mainとの重複・適用順は **Migration Check** で確認する。PRで追加する番号は最新mainの最大番号より後にする。同じパス・同じ内容でmainへ取り込み済みのSQLは対象外。マージ直前に最新mainを取り込み、このチェックを含む4つのCIが最新の変更で成功したことを確認する。mainの更新後は過去の成功結果が自動で失効しないため、CIを再実行する（[確認手順](docs/DEVELOPMENT.md#マージ直前に再確認する)）。
- **CIはPRに対してだけ走る。** ブランチへ push しただけでは走らないので、早く結果が見たいときは Draft でPRを作る。
- **`npm run build:scene` も必ず走らせる。** 型チェックもテストも通るのに、このバンドルだけが壊れることがある。esbuild は `es2017` / `ios13` / `chrome80` を対象にしており、**引数での分割代入のように変換できない書き方があるため。**

  ```
  Transforming destructuring to the configured target environment
  ("chrome80","es2017","ios13") is not supported yet
  ```

  CIにも同名のステップがあるので最終的には落ちるが、そこまで気づけない。0.3秒で終わるので、対象ファイルに関わらず毎回走らせる。
- **テストファイルは `tests/` に置けば自動で走る。** ロジック用は `tests/*.test.mjs`（`npm run test:unit` が glob で拾う）、画面の描画用は `tests/*.render.test.tsx`（`npm run test:render` の jest が拾う）。どこかに登録する必要はない。
- **ロジックを追加・変更したら、原則テストも追加する。** 金額計算・日付判定など、間違えると実害が大きいロジックは必須。単純な表示用ヘルパーなど実害が小さいものは任意。必須かどうか迷ったらユーザーに確認する。
- CodeRabbit の自動レビューコメントを確認し、妥当な指摘は修正してから再度 push する。
- PRテンプレート（`.github/PULL_REQUEST_TEMPLATE.md`）の確認事項（動作確認、`.env.example` の更新有無）を必ず埋める。
- PRへのレビューコメントは、該当箇所の行に対するインラインコメントで行う（PR全体への単一コメントにまとめない）。

## DBの構造変更

- **新しいマイグレーションは `npm run migration:new -- 説明のsnake_case` で作成する。** UTCの実際の作成日時（秒まで）で採番し、同じ番号が使われていれば次の空き番号を選ぶ。日付に `000000` を付けたり、他のファイルの番号をコピーしたりしない。Windows PowerShellでは `npm.cmd` を使う。
- 作成前に最新mainを取り込み、PR作成前に `npm run migration:check` を実行する。CIの照合相手は最新mainだけとし、別PRの作成・更新を理由に失敗させない。別PRがマージされた後は最新mainを取り込み、重複と適用順を再検証する。
- 重複や最新mainの最大番号以下の追加を指摘されたら稼働DBの適用履歴を先に確認し、**未適用であることが分かったファイルだけ**共通コマンドで新しい番号に作り直して参照を更新する。適用済み・適用状況不明のファイルは改名や履歴変更をせず、担当者と対応を確認する。
  - **今回限定の例外（[Issue #383](https://github.com/1R0U/my-home-bank/issues/383)、PR #382）:** `20261008094946_create_character_palettes.sql` と `20261008094954_backfill_frog_character_palettes.sql` はSQL Editorでの適用成功後に最新mainの番号が進んだため、2026-10-08のユーザー承認により改名せず保持する。[scripts/check-pr-migrations.mjs](scripts/check-pr-migrations.mjs) に登録したリポジトリ・PR番号・対象ブランチ・完全なパス・Git blob SHAに一致する2本だけ、最新mainの最大番号以下という順序違反を除外する。番号重複・最新main/headの再照合は省略しない。他のSQL・PR・内容変更には適用しない。本番SQLやmigration履歴を書き換える例外ではなく、SQL Editorでの適用成功とCLIの履歴登録は区別する。
- **Supabaseの管理画面（Table Editor）から、テーブルや列を直接変更しない。** 構造の変更は必ず `supabase/migrations/` にSQLファイルとして残す。
  - 管理画面での変更は記録に残らないため、新しい環境を作れなくなり、実DBとリポジトリの認識が静かにずれていく。
  - 実際に `users` / `quests` / `quest_logs` はこの経緯でマイグレーションが欠けており、後から追いつき用のファイルを足すことになった（[Issue #182](https://github.com/1R0U/my-home-bank/issues/182)）。
- **適用済みのマイグレーションは書き換えない。** 構造を変えるときは新しいファイルを追加する。既存ファイルを直すと、稼働中のDBと新しく作るDBで構造が変わってしまう。
- 列の追加・既存データの補完・不要な列の削除は、別のマイグレーションに分ける。削除は最後に回す（先に消すと元に戻しにくい）。
- 新しい制約を入れる前に、既存データが条件を満たしているかを確認する。満たさない場合は、推測で修正せず適用を止める（`20260903000000_create_bank_accounts.sql` が例）。
- **テーブルの列を足す・変える・消したら、`types/database.generated.ts` を作り直してコミットする**（`npm run db:types`。手順は [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#dbの型を生成する)）。手書きの型（`types/index.ts`）とのずれは `types/schemaCompat.ts` が型チェックで検出する。再生成を忘れるとCIの DB Migration ジョブが、手書きの型が追いついていないと Type Check ジョブが落ちる（[Issue #399](https://github.com/1R0U/my-home-bank/issues/399)）。
  - テーブルの行として扱う型を `types/index.ts` に足したら、`types/schemaCompat.ts` にも1行足す（足し忘れは `tests/codebaseRules.test.mjs` が検出する）。
- **テーブル・関数・トリガー・一意インデックス・RLS・ポリシーを足したら、[tests/sql/verify_remote_schema.sql](tests/sql/verify_remote_schema.sql) にも書き足す。** 稼働中のDBが最新かを確認するためのクエリで、書き足し忘れるとその物だけ確認対象から静かに外れる。忘れた場合はCIの DB Migration ジョブが落ちる（[tests/sql/verify_coverage.sql](tests/sql/verify_coverage.sql) がDBの実物と突き合わせている）。
- **publicにRLS付きテーブルを追加したら、`<テーブル名>_active_child_session` をrestrictive・全操作・authenticated向けに付け、`USING` / `WITH CHECK` の両方で `current_child_session_is_valid()` を検査する。** 失効した子供JWTによるRealtime等のアクセスを防ぎ、付け忘れはCIの `tests/sql/child_login_assertions.sql` が検出する。
- **`create table if not exists` を含むマイグレーションを足したら、[tests/sql/reapply_migrations.txt](tests/sql/reapply_migrations.txt) に `yes` / `no` を宣言する。** 既にテーブルがある環境へも適用される「追いつき用」なら `yes`（CIが再適用してデータが消えないことを確認する）、新規テーブル用なら `no`。宣言がないとCIが落ちる。
- **読み取り専用のRPC（データを変えない関数）は、名前を `get_` か `current_` で始める。** アプリは Supabase への要求のうち、この2つで始まるRPC以外を「書き込み」として数え、画面のフォーカス時の再取得を省いてよいかの判断に使っている（[lib/dataFreshness.ts](lib/dataFreshness.ts)、[Issue #243](https://github.com/1R0U/my-home-bank/issues/243)）。`list_` や `is_` などで始めると、それを呼ぶ画面のたびに「書き込みあり」と数えられ、全画面で再取得の省略が静かに効かなくなる。

## コーディング上のルール

- コミュニケーション・コメント・ドキュメントは日本語。
- `tsconfig.json` は `strict: false` スタート。無理に厳格化しない（明示的な指示がない限り）。
- 新しい画面は `app/` 配下にファイルを追加する（Expo Router のファイルベースルーティング）。
- 複数画面で使うUIパーツは `components/`、状態管理は `store/`、Supabase呼び出しは `lib/supabase.ts` 経由。
- `.env` はコミットしない。新しい環境変数を追加したら `.env.example` も更新する。
- **このアプリが扱う言葉（残高・承認など）の意味を変える、または新しく増やしたら、[docs/domain-glossary.md](docs/domain-glossary.md) も同じPRで更新する。** 新しいテーブルや列の追加、取引種別や状態の追加が対象。用語集と実装がずれると、用語集を置いた意味がなくなる。
  - 意味がまだ決まっていないものは、決めずに「要確認」として残してよい。
- **家庭内通貨の正式名称は「ゴル」、単位表記と内部識別子は `gol` とする。** 金額は原則 `1,000 gol`、日本語の文章や読み上げでは「ゴル」と表記する。「ポイント」、`pt`、`P`、`PT`、`Pt`、`¥`、`HMC` を家庭内通貨の表示名として新たに使わない（現金の日本円を表す「円」「¥」は除く）。新しいコード・DBオブジェクトに `hmc` を使わない。`hmc` を含む既存DB列・RPCは旧クライアント互換用に限って残し、正式な `gol` 側から参照しない。
- タスクの範囲を超えたリファクタや抽象化を勝手に混ぜない（別Issueに切り出す）。
  - ただし軽微な修正であれば、ユーザーに確認を取った上で、PRの説明にその内容を明記して同じPRに含めてよい。

## コードの書き方（再発防止）

同じ処理を画面ごとに手書きでコピーした結果、少しずつずれて不具合になったものを、共通の仕組みにまとめてある（[Issue #399](https://github.com/1R0U/my-home-bank/issues/399)）。**新しく書くときも共通の仕組みを使う。** 主なものは [tests/codebaseRules.test.mjs](tests/codebaseRules.test.mjs) が自動で検出する。例外の一覧へ足すのは最後の手段で、足すときは理由を書く。

### データの取得

- **サーバーのデータを画面に出すときは、`lib/useResource.ts` を使ったフック（`lib/use*.ts`）を書く。** `useState` + `createStaleGuard` + `useRefetchOnFocus` を手書きしない。
  - 古い応答の無視、利用者が変わったときのクリア、画面に戻ったときの再取得、同じデータを使う画面どうしの共有は、ここがまとめて引き受ける。手書きしたフックでは、マウント時に2回取得したり、フォーカス時に取り直さなかったりするずれが実際に起きていた。
  - **`key` には、取得結果を変えうる値（利用者ID・家族IDなど）を全部入れる。** 入れ忘れると、別の利用者のデータを共有して表示してしまう。
  - 実データを使わないとき（モックアカウント・未ログイン・開発用ロール指定）は `key: null` にし、モックは `preview` で渡す。画面で `isLive ? 実データ : MOCK_xxx` の分岐を書かない。
  - 書き込みの後は `reload()` を呼ぶ。他の画面の表示は、通信の層で書き込みを数えているので（`lib/dataFreshness.ts`）、画面へ戻ったときに自動で取り直される。
- **画面（`app/`・`components/`）から Supabase を直接呼ばない。** 呼び出しは `lib/` のサービス（`xxxService.ts`）に置き、テストからクライアントを差し替えられるようにする。

### 見た目

- **画面のファイルに色（`"#0f172a"` など）を直書きしない。** className を受け取れない場所（アイコンの `color` など）には、大人用は `constants/ui.ts` の `UI_COLORS`、子供用は `components/childTheme.ts` の `CHILD_THEME` を渡す。無い色はそこへ足す。3Dや絵の配色は例外。
- エラーの文字色は `ERROR_TEXT_CLASS`、注記は `NOTICE_TEXT_CLASS` を使う（`text-rose-500` / `text-slate-300` は背景とのコントラストが足りない。Issue #272）。
- **2つ以上の画面に同じ見た目の部品をコピーしない。** `components/` に部品として置く。今あるもの: `ScreenHeader`（見出し）、`FolderTabButton`（大人用のフォルダ風タブ）、`ErrorWithRetry`（エラーと再試行ボタン）、`SubmitGateNotice`、`KeyboardAvoidingScreen`。
- スタイルの書き方は2通りに分けている。**大人用の画面は NativeWind（className）**。木と羊皮紙の世界観で作る**子供用の画面は `StyleSheet`**（`tasks/taskStyles.ts`・`store/storeStyles.ts`）で、両方に出る色は `CHILD_THEME` に置く。

### ファイルの大きさ

- 1つの画面やモジュールが大きくなったら（目安: 500行）、責務ごとにフックや部品へ切り出す。例: RPGハブ画面のマップ表示の計算（`useHubMinimap`）とシーンへの同期（`useHubSceneSync`）、シーンの照明（`webview/rpg-hub/lighting.ts`）。タスクの範囲を超える分割は別Issueにする。

## ディレクトリ構造

```
my-home-bank/
├── app/          # 画面ファイル（Expo Router）
├── components/   # 複数画面で使い回すパーツ
├── lib/          # Supabase クライアントなど
├── store/        # Zustand（状態管理）
├── constants/    # 定数
├── types/        # 型定義
├── assets/       # 画像・フォントなど
└── docs/         # ドキュメント（開発ガイド等）
```

## 関連ドキュメント

- [CONTRIBUTING.md](CONTRIBUTING.md) — 開発フローの要約
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — 環境構築を含む詳細な開発ガイド（初回セットアップ手順など）
- [docs/domain-glossary.md](docs/domain-glossary.md) — 用語集。「残高」「承認」など、このアプリが扱う言葉の意味をそろえる
