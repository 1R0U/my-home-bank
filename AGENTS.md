# AGENTS.md

このファイルは、このリポジトリで作業する **全てのAIコーディングツール共通** のルールです。
Claude Code、Cursor、GitHub Copilot、Codex など、使用するツールに関わらずここに書かれたルールに従ってください。
（ツール固有の設定ファイルがある場合は、このファイルを参照する形にしています。重複させず、ルールの変更は必ずこのファイルに対して行ってください。）

## プロジェクト概要

「我が家中央銀行」— 家庭内の家事・お手伝いをクエスト化し、独自通貨・銀行・ストアで報酬を与える家族向けアプリ。
詳細は [README.md](README.md) を参照。

## 技術スタック

- TypeScript（`strict: false`）
- Expo / React Native（Expo Router によるファイルベースルーティング）
- NativeWind（Tailwind CSS for RN）
- Zustand（状態管理）
- Supabase（DB / Auth / Realtime、直接呼び出し。TanStack Query 等は未導入）
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
```

- CI（Type Check / Test / DB Migration）が通ることを確認してから push する。
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

- **Supabaseの管理画面（Table Editor）から、テーブルや列を直接変更しない。** 構造の変更は必ず `supabase/migrations/` にSQLファイルとして残す。
  - 管理画面での変更は記録に残らないため、新しい環境を作れなくなり、実DBとリポジトリの認識が静かにずれていく。
  - 実際に `users` / `quests` / `quest_logs` はこの経緯でマイグレーションが欠けており、後から追いつき用のファイルを足すことになった（[Issue #182](https://github.com/1R0U/my-home-bank/issues/182)）。
- **適用済みのマイグレーションは書き換えない。** 構造を変えるときは新しいファイルを追加する。既存ファイルを直すと、稼働中のDBと新しく作るDBで構造が変わってしまう。
- 列の追加・既存データの補完・不要な列の削除は、別のマイグレーションに分ける。削除は最後に回す（先に消すと元に戻しにくい）。
- 新しい制約を入れる前に、既存データが条件を満たしているかを確認する。満たさない場合は、推測で修正せず適用を止める（`20260903000000_create_bank_accounts.sql` が例）。
- **テーブル・関数・トリガー・一意インデックス・RLS・ポリシーを足したら、[tests/sql/verify_remote_schema.sql](tests/sql/verify_remote_schema.sql) にも書き足す。** 稼働中のDBが最新かを確認するためのクエリで、書き足し忘れるとその物だけ確認対象から静かに外れる。忘れた場合はCIの DB Migration ジョブが落ちる（[tests/sql/verify_coverage.sql](tests/sql/verify_coverage.sql) がDBの実物と突き合わせている）。
- **`create table if not exists` を含むマイグレーションを足したら、[tests/sql/reapply_migrations.txt](tests/sql/reapply_migrations.txt) に `yes` / `no` を宣言する。** 既にテーブルがある環境へも適用される「追いつき用」なら `yes`（CIが再適用してデータが消えないことを確認する）、新規テーブル用なら `no`。宣言がないとCIが落ちる。

## コーディング上のルール

- コミュニケーション・コメント・ドキュメントは日本語。
- `tsconfig.json` は `strict: false` スタート。無理に厳格化しない（明示的な指示がない限り）。
- 新しい画面は `app/` 配下にファイルを追加する（Expo Router のファイルベースルーティング）。
- 複数画面で使うUIパーツは `components/`、状態管理は `store/`、Supabase呼び出しは `lib/supabase.ts` 経由。
- `.env` はコミットしない。新しい環境変数を追加したら `.env.example` も更新する。
- **このアプリが扱う言葉（残高・承認など）の意味を変える、または新しく増やしたら、[docs/domain-glossary.md](docs/domain-glossary.md) も同じPRで更新する。** 新しいテーブルや列の追加、取引種別や状態の追加が対象。用語集と実装がずれると、用語集を置いた意味がなくなる。
  - 意味がまだ決まっていないものは、決めずに「要確認」として残してよい。
- タスクの範囲を超えたリファクタや抽象化を勝手に混ぜない（別Issueに切り出す）。
  - ただし軽微な修正であれば、ユーザーに確認を取った上で、PRの説明にその内容を明記して同じPRに含めてよい。

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
